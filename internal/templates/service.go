package templates

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/npms-platform/npms/internal/platform/database"
	"gorm.io/gorm"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/npms-platform/npms/internal/audit"
	"github.com/npms-platform/npms/internal/tenant"
)

type Template struct {
	ID              uuid.UUID       `json:"id"`
	Name            string          `json:"name"`
	SourceProjectID *uuid.UUID      `json:"source_project_id,omitempty"`
	Structure       json.RawMessage `json:"structure"`
	CreatedAt       time.Time       `json:"created_at"`
}

type MarketplaceItem struct {
	ID          uuid.UUID  `json:"id"`
	TemplateID  uuid.UUID  `json:"template_id"`
	DivisionID  *uuid.UUID `json:"division_id,omitempty"`
	Name        string     `json:"name"`
	Description string     `json:"description"`
	IsPublished bool       `json:"is_published"`
	CreatedAt   time.Time  `json:"created_at"`
}

type Service struct {
	db    *gorm.DB
	audit *audit.Service
}

func NewService(db *gorm.DB) *Service { return &Service{db: db, audit: audit.NewService()} }

func (s *Service) List(ctx context.Context) ([]Template, error) {
	p, err := tenant.PrincipalFrom(ctx)
	if err != nil {
		return nil, err
	}
	rows, err := database.Rows(s.db, ctx, `SELECT id,name,source_project_id,structure_json,created_at FROM project_templates WHERE tenant_id=$1 ORDER BY updated_at DESC`, p.TenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Template{}
	for rows.Next() {
		var v Template
		if err = rows.Scan(&v.ID, &v.Name, &v.SourceProjectID, &v.Structure, &v.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

func (s *Service) Capture(ctx context.Context, name string, projectID uuid.UUID) (Template, error) {
	p, err := tenant.PrincipalFrom(ctx)
	if err != nil {
		return Template{}, err
	}
	if strings.TrimSpace(name) == "" {
		return Template{}, fmt.Errorf("name required")
	}
	var exists bool
	if err = database.Row(s.db, ctx, `SELECT EXISTS(SELECT 1 FROM projects WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL)`, p.TenantID, projectID).Scan(&exists); err != nil || !exists {
		if err == nil {
			err = fmt.Errorf("project not found")
		}
		return Template{}, err
	}
	type item struct {
		Label string `json:"label"`
	}
	type task struct {
		Title       string `json:"title"`
		BoardColumn string `json:"board_column"`
		Position    int    `json:"position"`
		Checklist   []item `json:"checklist"`
	}
	rows, err := database.Rows(s.db, ctx, `SELECT id,title,board_column,position FROM tasks WHERE tenant_id=$1 AND project_id=$2 AND deleted_at IS NULL ORDER BY board_column,position`, p.TenantID, projectID)
	if err != nil {
		return Template{}, err
	}
	defer rows.Close()
	tasks := []task{}
	for rows.Next() {
		var id uuid.UUID
		var t task
		if err = rows.Scan(&id, &t.Title, &t.BoardColumn, &t.Position); err != nil {
			return Template{}, err
		}
		cr, e := database.Rows(s.db, ctx, `SELECT label FROM checklist_items WHERE tenant_id=$1 AND task_id=$2 ORDER BY item_order`, p.TenantID, id)
		if e != nil {
			return Template{}, e
		}
		for cr.Next() {
			var i item
			if e = cr.Scan(&i.Label); e != nil {
				cr.Close()
				return Template{}, e
			}
			t.Checklist = append(t.Checklist, i)
		}
		cr.Close()
		tasks = append(tasks, t)
	}
	structure, _ := json.Marshal(map[string]any{"tasks": tasks})
	tx, err := database.Begin(s.db, ctx)
	if err != nil {
		return Template{}, err
	}
	defer database.Rollback(tx)
	var out Template
	err = database.Row(tx, ctx, `INSERT INTO project_templates(tenant_id,name,source_project_id,structure_json) VALUES($1,$2,$3,$4) RETURNING id,name,source_project_id,structure_json,created_at`, p.TenantID, name, projectID, structure).Scan(&out.ID, &out.Name, &out.SourceProjectID, &out.Structure, &out.CreatedAt)
	if err != nil {
		return Template{}, err
	}
	if err = s.audit.Record(ctx, tx, audit.Event{TenantID: p.TenantID, ActorID: p.ActorID, ActorSource: p.Source, Action: "create", EntityType: "project_template", EntityID: out.ID, After: out}); err != nil {
		return Template{}, err
	}
	if err = database.Commit(tx); err != nil {
		return Template{}, err
	}
	return out, nil
}

func (s *Service) Marketplace(ctx context.Context) ([]MarketplaceItem, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil {
		return nil, e
	}
	rows, e := database.Rows(s.db, ctx, `SELECT m.id,m.template_id,m.division_id,t.name,COALESCE(m.description,'') AS description,m.is_published,m.created_at FROM template_marketplace m JOIN project_templates t ON t.id=m.template_id AND t.tenant_id=m.tenant_id WHERE m.tenant_id=$1 AND m.is_published ORDER BY m.created_at DESC`, p.TenantID)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []MarketplaceItem{}
	for rows.Next() {
		var v MarketplaceItem
		if e = rows.Scan(&v.ID, &v.TemplateID, &v.DivisionID, &v.Name, &v.Description, &v.IsPublished, &v.CreatedAt); e != nil {
			return nil, e
		}
		out = append(out, v)
	}
	return out, rows.Err()
}
func (s *Service) Publish(ctx context.Context, templateID uuid.UUID, divisionID *uuid.UUID, description string) (MarketplaceItem, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil {
		return MarketplaceItem{}, e
	}
	tx, e := database.Begin(s.db, ctx)
	if e != nil {
		return MarketplaceItem{}, e
	}
	defer database.Rollback(tx)
	var out MarketplaceItem
	e = database.Row(tx, ctx, `INSERT INTO template_marketplace(tenant_id,template_id,division_id,published_by,name,description,version,export_json,is_published) SELECT $1,id,$3,$5,name,$4,COALESCE((SELECT max(version)+1 FROM template_marketplace WHERE tenant_id=$1 AND template_id=$2),1),structure_json,true FROM project_templates WHERE tenant_id=$1 AND id=$2 RETURNING id,template_id,division_id,name,COALESCE(description,''),is_published,created_at`, p.TenantID, templateID, divisionID, description, p.ActorID).Scan(&out.ID, &out.TemplateID, &out.DivisionID, &out.Name, &out.Description, &out.IsPublished, &out.CreatedAt)
	if e != nil {
		return MarketplaceItem{}, e
	}
	if e = s.audit.Record(ctx, tx, audit.Event{TenantID: p.TenantID, ActorID: p.ActorID, ActorSource: p.Source, Action: "publish", EntityType: "template_marketplace", EntityID: out.ID, After: out}); e != nil {
		return MarketplaceItem{}, e
	}
	e = database.Commit(tx)
	return out, e
}
