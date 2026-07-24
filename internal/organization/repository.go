package organization

import (
	"context"
	"errors"
	"fmt"
	"github.com/google/uuid"
	"github.com/npms-platform/npms/internal/platform/database"
	"gorm.io/gorm"
)

type Repository struct{ db *gorm.DB }

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }
func (r *Repository) List(ctx context.Context, tenantID uuid.UUID) ([]Division, error) {
	rows, e := database.Rows(r.db, ctx, `SELECT id,parent_division_id,name,created_at FROM divisions WHERE tenant_id=$1 ORDER BY name`, tenantID)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []Division{}
	for rows.Next() {
		var d Division
		if e = rows.Scan(&d.ID, &d.ParentDivisionID, &d.Name, &d.CreatedAt); e != nil {
			return nil, e
		}
		teams, teamErr := r.teams(ctx, tenantID, d.ID)
		if teamErr != nil {
			return nil, teamErr
		}
		d.Teams = teams
		leadIDs, leadErr := r.leadUserIDs(ctx, tenantID, d.ID)
		if leadErr != nil {
			return nil, leadErr
		}
		d.LeadUserIDs = leadIDs
		out = append(out, d)
	}
	return out, rows.Err()
}
func (r *Repository) leadUserIDs(ctx context.Context, tenantID, divisionID uuid.UUID) ([]uuid.UUID, error) {
	rows, e := database.Rows(r.db, ctx, `SELECT user_id FROM division_leads WHERE tenant_id=$1 AND division_id=$2 ORDER BY created_at`, tenantID, divisionID)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []uuid.UUID{}
	for rows.Next() {
		var id uuid.UUID
		if e = rows.Scan(&id); e != nil {
			return nil, e
		}
		out = append(out, id)
	}
	return out, rows.Err()
}
func (r *Repository) DivisionExists(ctx context.Context, tx *gorm.DB, tenantID, divisionID uuid.UUID) (bool, error) {
	var exists bool
	e := database.Row(tx, ctx, `SELECT EXISTS(SELECT 1 FROM divisions WHERE tenant_id=$1 AND id=$2)`, tenantID, divisionID).Scan(&exists)
	return exists, e
}
func (r *Repository) UsersExist(ctx context.Context, tx *gorm.DB, tenantID uuid.UUID, userIDs []uuid.UUID) (bool, error) {
	for _, userID := range userIDs {
		var exists bool
		if e := database.Row(tx, ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE tenant_id=$1 AND id=$2)`, tenantID, userID).Scan(&exists); e != nil || !exists {
			return false, e
		}
	}
	return true, nil
}
func (r *Repository) ReplaceLeads(ctx context.Context, tx *gorm.DB, tenantID, divisionID uuid.UUID, userIDs []uuid.UUID) error {
	if _, e := database.Exec(tx, ctx, `DELETE FROM division_leads WHERE tenant_id=$1 AND division_id=$2`, tenantID, divisionID); e != nil {
		return e
	}
	for _, userID := range userIDs {
		if _, e := database.Exec(tx, ctx, `INSERT INTO division_leads(tenant_id,division_id,user_id) VALUES($1,$2,$3)`, tenantID, divisionID, userID); e != nil {
			return e
		}
	}
	return nil
}
func (r *Repository) teams(ctx context.Context, tenantID, divisionID uuid.UUID) ([]Team, error) {
	rows, e := database.Rows(r.db, ctx, `SELECT id,name FROM teams WHERE tenant_id=$1 AND division_id=$2 ORDER BY name`, tenantID, divisionID)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []Team{}
	for rows.Next() {
		var t Team
		if e = rows.Scan(&t.ID, &t.Name); e != nil {
			return nil, e
		}
		out = append(out, t)
	}
	return out, rows.Err()
}
func (r *Repository) Role(ctx context.Context, tenantID, userID uuid.UUID) (string, error) {
	var role string
	e := database.Row(r.db, ctx, `SELECT role FROM users WHERE tenant_id=$1 AND id=$2`, tenantID, userID).Scan(&role)
	return role, e
}
func (r *Repository) NameExists(ctx context.Context, tx *gorm.DB, tenantID uuid.UUID, name string) (bool, error) {
	var exists bool
	e := database.Row(tx, ctx, `SELECT EXISTS(SELECT 1 FROM divisions WHERE tenant_id=$1 AND lower(name)=lower($2))`, tenantID, name).Scan(&exists)
	return exists, e
}
func (r *Repository) ParentExists(ctx context.Context, tx *gorm.DB, tenantID, parentID uuid.UUID) (bool, error) {
	var exists bool
	e := database.Row(tx, ctx, `SELECT EXISTS(SELECT 1 FROM divisions WHERE tenant_id=$1 AND id=$2)`, tenantID, parentID).Scan(&exists)
	return exists, e
}
func (r *Repository) Create(ctx context.Context, tx *gorm.DB, tenantID uuid.UUID, q CreateRequest) (Division, error) {
	var d Division
	e := database.Row(tx, ctx, `INSERT INTO divisions(tenant_id,parent_division_id,name) VALUES($1,$2,$3) RETURNING id,parent_division_id,name,created_at`, tenantID, q.ParentDivisionID, q.Name).Scan(&d.ID, &d.ParentDivisionID, &d.Name, &d.CreatedAt)
	if e != nil {
		return Division{}, fmt.Errorf("create division: %w", e)
	}
	d.Teams = []Team{}
	if q.InitialTeamName != "" {
		var t Team
		e = database.Row(tx, ctx, `INSERT INTO teams(tenant_id,division_id,name) VALUES($1,$2,$3) RETURNING id,name`, tenantID, d.ID, q.InitialTeamName).Scan(&t.ID, &t.Name)
		if e != nil {
			return Division{}, e
		}
		d.Teams = append(d.Teams, t)
	}
	return d, nil
}

var _ = errors.Is
