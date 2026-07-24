package projects

import (
	"context"
	"fmt"
	"github.com/npms-platform/npms/internal/platform/database"
	"gorm.io/gorm"

	"github.com/google/uuid"
	"github.com/npms-platform/npms/internal/audit"
	"github.com/npms-platform/npms/internal/tenant"
)

type DirectoryUser struct {
	ID     uuid.UUID  `json:"id"`
	TeamID *uuid.UUID `json:"team_id,omitempty"`
	Name   string     `json:"name"`
	Email  string     `json:"email"`
	Role   string     `json:"role"`
}

func (s *Service) Users(ctx context.Context) ([]DirectoryUser, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil {
		return nil, e
	}
	rows, e := database.Rows(s.db, ctx, `SELECT id,team_id,name,email,role FROM users WHERE tenant_id=$1 ORDER BY name`, p.TenantID)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []DirectoryUser{}
	for rows.Next() {
		var u DirectoryUser
		if e = rows.Scan(&u.ID, &u.TeamID, &u.Name, &u.Email, &u.Role); e != nil {
			return nil, e
		}
		out = append(out, u)
	}
	return out, rows.Err()
}
func (s *Service) SubmitReview(ctx context.Context, projectID uuid.UUID) (Project, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil {
		return Project{}, e
	}
	tx, e := database.Begin(s.db, ctx)
	if e != nil {
		return Project{}, e
	}
	defer database.Rollback(tx)
	before, e := scanProject(database.Row(tx, ctx, `SELECT `+projectColumns+` FROM projects WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL FOR UPDATE`, p.TenantID, projectID))
	if e != nil {
		return Project{}, fmt.Errorf("project not found")
	}
	if before.Status == "review" || before.Status == "done" {
		return Project{}, fmt.Errorf("project workflow already submitted")
	}
	rows, e := database.Rows(tx, ctx, `SELECT user_id FROM project_people WHERE tenant_id=$1 AND project_id=$2 AND project_role='reviewer'`, p.TenantID, projectID)
	if e != nil {
		return Project{}, e
	}
	reviewers := []uuid.UUID{}
	for rows.Next() {
		var id uuid.UUID
		if e = rows.Scan(&id); e != nil {
			rows.Close()
			return Project{}, e
		}
		reviewers = append(reviewers, id)
	}
	rows.Close()
	status := "done"
	if len(reviewers) > 0 {
		status = "review"
		for _, reviewer := range reviewers {
			if _, e = database.Exec(tx, ctx, `INSERT INTO reviews(tenant_id,entity_type,entity_id,reviewer_id) VALUES($1,'project',$2,$3)`, p.TenantID, projectID, reviewer); e != nil {
				return Project{}, e
			}
		}
	}
	after, e := scanProject(database.Row(tx, ctx, `UPDATE projects SET status=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING `+projectColumns, p.TenantID, projectID, status))
	if e != nil {
		return Project{}, e
	}
	if e = s.audit.Record(ctx, tx, audit.Event{TenantID: p.TenantID, ActorID: p.ActorID, ActorSource: p.Source, Action: "submit_review", EntityType: "project", EntityID: projectID, Before: before, After: map[string]any{"project": after, "reviewers": reviewers}}); e != nil {
		return Project{}, e
	}
	if e = database.Commit(tx); e != nil {
		return Project{}, e
	}
	return after, nil
}

var _ *gorm.DB
