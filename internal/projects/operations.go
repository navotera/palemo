package projects

import (
	"context"
	"fmt"
	"github.com/google/uuid"
	"github.com/npms-platform/npms/internal/audit"
	"github.com/npms-platform/npms/internal/platform/database"
	"github.com/npms-platform/npms/internal/tenant"
	"strings"
)

type UpdateRequest struct {
	Name            *string    `json:"name"`
	Status          *string    `json:"status"`
	TeamID          *uuid.UUID `json:"team_id"`
	ParentProjectID *uuid.UUID `json:"parent_project_id"`
	Metadata        []byte     `json:"metadata"`
}
type AssignmentRequest struct {
	TeamID      *uuid.UUID `json:"team_id"`
	Assignments []struct {
		TaskID uuid.UUID `json:"task_id"`
		UserID uuid.UUID `json:"user_id"`
	} `json:"assignments"`
}
type ChecklistRequest struct {
	Title string   `json:"title"`
	Items []string `json:"items"`
}

func scanProject(row database.RowScanner) (Project, error) {
	var p Project
	e := row.Scan(&p.ID, &p.TeamID, &p.ParentProjectID, &p.TemplateID, &p.Name, &p.Status, &p.Source, &p.SourceRef, &p.Metadata, &p.CreatedAt, &p.UpdatedAt)
	return p, e
}

const projectColumns = `id,team_id,parent_project_id,template_id,name,status,source,source_ref,metadata,created_at,updated_at`

func (s *Service) Get(ctx context.Context, id uuid.UUID) (Project, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil {
		return Project{}, e
	}
	v, e := scanProject(database.Row(s.db, ctx, `SELECT `+projectColumns+` FROM projects WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL`, p.TenantID, id))
	if database.IsNotFound(e) {
		return Project{}, fmt.Errorf("project not found")
	}
	return v, e
}
func (s *Service) Update(ctx context.Context, id uuid.UUID, q UpdateRequest) (Project, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil {
		return Project{}, e
	}
	if q.Status != nil {
		ok := map[string]bool{"planning": true, "active": true, "on_hold": true, "completed": true, "cancelled": true}
		if !ok[*q.Status] {
			return Project{}, fmt.Errorf("invalid status")
		}
	}
	tx, e := database.Begin(s.db, ctx)
	if e != nil {
		return Project{}, e
	}
	defer database.Rollback(tx)
	before, e := scanProject(database.Row(tx, ctx, `SELECT `+projectColumns+` FROM projects WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL FOR UPDATE`, p.TenantID, id))
	if e != nil {
		return Project{}, fmt.Errorf("project not found")
	}
	name := before.Name
	if q.Name != nil {
		name = strings.TrimSpace(*q.Name)
		if name == "" {
			return Project{}, fmt.Errorf("name required")
		}
	}
	status := before.Status
	if q.Status != nil {
		status = *q.Status
	}
	team := before.TeamID
	if q.TeamID != nil {
		team = *q.TeamID
	}
	parent := before.ParentProjectID
	if q.ParentProjectID != nil {
		parent = q.ParentProjectID
	}
	metadata := before.Metadata
	if len(q.Metadata) > 0 {
		metadata = q.Metadata
	}
	after, e := scanProject(database.Row(tx, ctx, `UPDATE projects SET name=$3,status=$4,team_id=$5,parent_project_id=$6,metadata=$7,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING `+projectColumns, p.TenantID, id, name, status, team, parent, metadata))
	if e != nil {
		return Project{}, e
	}
	if e = s.audit.Record(ctx, tx, audit.Event{TenantID: p.TenantID, ActorID: p.ActorID, ActorSource: p.Source, Action: "update", EntityType: "project", EntityID: id, Before: before, After: after}); e != nil {
		return Project{}, e
	}
	e = database.Commit(tx)
	return after, e
}
func (s *Service) Assign(ctx context.Context, id uuid.UUID, q AssignmentRequest) error {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil {
		return e
	}
	tx, e := database.Begin(s.db, ctx)
	if e != nil {
		return e
	}
	defer database.Rollback(tx)
	if q.TeamID != nil {
		result, e := database.Exec(tx, ctx, `UPDATE projects SET team_id=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL`, p.TenantID, id, *q.TeamID)
		if e != nil {
			return e
		}
		n, _ := result.RowsAffected()
		if n == 0 {
			return fmt.Errorf("project not found")
		}
	}
	for _, a := range q.Assignments {
		result, e := database.Exec(tx, ctx, `UPDATE tasks SET assignee_id=$4,updated_at=now() WHERE tenant_id=$1 AND project_id=$2 AND id=$3 AND deleted_at IS NULL`, p.TenantID, id, a.TaskID, a.UserID)
		if e != nil {
			return e
		}
		n, _ := result.RowsAffected()
		if n == 0 {
			return fmt.Errorf("task not found")
		}
	}
	if e = s.audit.Record(ctx, tx, audit.Event{TenantID: p.TenantID, ActorID: p.ActorID, ActorSource: p.Source, Action: "assign", EntityType: "project", EntityID: id, After: q}); e != nil {
		return e
	}
	return database.Commit(tx)
}
func (s *Service) GenerateChecklist(ctx context.Context, id uuid.UUID, q ChecklistRequest) (uuid.UUID, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil {
		return uuid.Nil, e
	}
	if len(q.Items) == 0 {
		return uuid.Nil, fmt.Errorf("items required")
	}
	title := strings.TrimSpace(q.Title)
	if title == "" {
		title = "Project checklist"
	}
	tx, e := database.Begin(s.db, ctx)
	if e != nil {
		return uuid.Nil, e
	}
	defer database.Rollback(tx)
	var taskID uuid.UUID
	e = database.Row(tx, ctx, `INSERT INTO tasks(tenant_id,project_id,title,board_column,position) SELECT $1,id,$3,'todo',COALESCE((SELECT max(position)+1 FROM tasks WHERE tenant_id=$1 AND project_id=$2 AND board_column='todo'),0) FROM projects WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL RETURNING id`, p.TenantID, id, title).Scan(&taskID)
	if e != nil {
		return uuid.Nil, fmt.Errorf("project not found")
	}
	for i, label := range q.Items {
		label = strings.TrimSpace(label)
		if label == "" {
			continue
		}
		if _, e = database.Exec(tx, ctx, `INSERT INTO checklist_items(tenant_id,task_id,label,item_order) VALUES($1,$2,$3,$4)`, p.TenantID, taskID, label, i); e != nil {
			return uuid.Nil, e
		}
	}
	if e = s.audit.Record(ctx, tx, audit.Event{TenantID: p.TenantID, ActorID: p.ActorID, ActorSource: p.Source, Action: "generate_checklist", EntityType: "project", EntityID: id, After: map[string]any{"task_id": taskID, "items": len(q.Items)}}); e != nil {
		return uuid.Nil, e
	}
	e = database.Commit(tx)
	return taskID, e
}
