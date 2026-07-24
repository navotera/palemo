package sops

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/google/uuid"
	"github.com/npms-platform/npms/internal/audit"
	"github.com/npms-platform/npms/internal/platform/database"
	"github.com/npms-platform/npms/internal/tenant"
	"gorm.io/gorm"
	"strings"
	"time"
)

type Step struct {
	Label string `json:"label"`
}
type SOP struct {
	ID          uuid.UUID  `json:"id"`
	WorkspaceID uuid.UUID  `json:"workspace_id"`
	TeamID      *uuid.UUID `json:"team_id"`
	Title       string     `json:"title"`
	Description *string    `json:"description"`
	Steps       []Step     `json:"steps"`
	Version     int        `json:"version"`
	Active      bool       `json:"is_active"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}
type CreateRequest struct {
	WorkspaceID uuid.UUID  `json:"workspace_id"`
	TeamID      *uuid.UUID `json:"team_id"`
	Title       string     `json:"title"`
	Description *string    `json:"description"`
	Steps       []Step     `json:"steps"`
}
type Service struct {
	db    *gorm.DB
	audit *audit.Service
}

func NewService(db *gorm.DB) *Service { return &Service{db: db, audit: audit.NewService()} }
func (s *Service) List(ctx context.Context) ([]SOP, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil {
		return nil, e
	}
	rows, e := database.Rows(s.db, ctx, `SELECT id,workspace_id,team_id,title,description,steps,version,is_active,created_at,updated_at FROM sop_repository WHERE tenant_id=$1 ORDER BY updated_at DESC`, p.TenantID)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []SOP{}
	for rows.Next() {
		var item SOP
		var raw []byte
		if e = rows.Scan(&item.ID, &item.WorkspaceID, &item.TeamID, &item.Title, &item.Description, &raw, &item.Version, &item.Active, &item.CreatedAt, &item.UpdatedAt); e != nil {
			return nil, e
		}
		if e = json.Unmarshal(raw, &item.Steps); e != nil {
			return nil, e
		}
		out = append(out, item)
	}
	return out, rows.Err()
}
func (s *Service) Create(ctx context.Context, request CreateRequest) (SOP, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil || p.ActorID == nil {
		return SOP{}, fmt.Errorf("user session required")
	}
	if request.WorkspaceID == uuid.Nil || strings.TrimSpace(request.Title) == "" || len(request.Steps) == 0 {
		return SOP{}, fmt.Errorf("workspace_id, title, and steps required")
	}
	for _, step := range request.Steps {
		if strings.TrimSpace(step.Label) == "" {
			return SOP{}, fmt.Errorf("step label required")
		}
	}
	raw, _ := json.Marshal(request.Steps)
	tx, e := database.Begin(s.db, ctx)
	if e != nil {
		return SOP{}, e
	}
	defer database.Rollback(tx)
	var item SOP
	var stored []byte
	e = database.Row(tx, ctx, `INSERT INTO sop_repository(tenant_id,workspace_id,team_id,title,description,steps,author_id) SELECT $1,$2,$3,$4,$5,$6,$7 WHERE EXISTS(SELECT 1 FROM knowledge_workspaces WHERE tenant_id=$1 AND id=$2) RETURNING id,workspace_id,team_id,title,description,steps,version,is_active,created_at,updated_at`, p.TenantID, request.WorkspaceID, request.TeamID, request.Title, request.Description, raw, *p.ActorID).Scan(&item.ID, &item.WorkspaceID, &item.TeamID, &item.Title, &item.Description, &stored, &item.Version, &item.Active, &item.CreatedAt, &item.UpdatedAt)
	if e != nil {
		return SOP{}, e
	}
	_ = json.Unmarshal(stored, &item.Steps)
	if e = s.audit.Record(ctx, tx, audit.Event{TenantID: p.TenantID, ActorID: p.ActorID, ActorSource: p.Source, Action: "create", EntityType: "sop", EntityID: item.ID, After: item}); e != nil {
		return SOP{}, e
	}
	if e = database.Commit(tx); e != nil {
		return SOP{}, e
	}
	return item, nil
}
func (s *Service) Apply(ctx context.Context, sopID, taskID uuid.UUID) (int, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil {
		return 0, e
	}
	tx, e := database.Begin(s.db, ctx)
	if e != nil {
		return 0, e
	}
	defer database.Rollback(tx)
	var raw []byte
	var version int
	e = database.Row(tx, ctx, `SELECT steps,version FROM sop_repository WHERE tenant_id=$1 AND id=$2 AND is_active`, p.TenantID, sopID).Scan(&raw, &version)
	if e != nil {
		return 0, e
	}
	var steps []Step
	if e = json.Unmarshal(raw, &steps); e != nil {
		return 0, e
	}
	var taskExists bool
	e = database.Row(tx, ctx, `SELECT EXISTS(SELECT 1 FROM tasks WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL)`, p.TenantID, taskID).Scan(&taskExists)
	if e != nil || !taskExists {
		return 0, fmt.Errorf("task not found")
	}
	for index, step := range steps {
		var id uuid.UUID
		e = database.Row(tx, ctx, `INSERT INTO checklist_items(tenant_id,task_id,label,item_order,sop_id,sop_version) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`, p.TenantID, taskID, step.Label, index, sopID, version).Scan(&id)
		if e != nil {
			return 0, e
		}
		if e = s.audit.Record(ctx, tx, audit.Event{TenantID: p.TenantID, ActorID: p.ActorID, ActorSource: "sop_engine", Action: "create", EntityType: "checklist_item", EntityID: id, After: map[string]any{"task_id": taskID, "label": step.Label, "sop_id": sopID, "sop_version": version}}); e != nil {
			return 0, e
		}
	}
	if e = database.Commit(tx); e != nil {
		return 0, e
	}
	return len(steps), nil
}
