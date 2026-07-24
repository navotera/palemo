package reviews

import (
	"context"
	"fmt"
	"github.com/npms-platform/npms/internal/platform/database"
	"gorm.io/gorm"
	"time"

	"github.com/google/uuid"
	"github.com/npms-platform/npms/internal/audit"
	"github.com/npms-platform/npms/internal/tenant"
)

type Review struct {
	ID         uuid.UUID `json:"id"`
	EntityType string    `json:"entity_type"`
	EntityID   uuid.UUID `json:"entity_id"`
	ReviewerID uuid.UUID `json:"reviewer_id"`
	Status     string    `json:"status"`
	Notes      *string   `json:"notes"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}
type CreateRequest struct {
	EntityType string     `json:"entity_type"`
	EntityID   uuid.UUID  `json:"entity_id"`
	ReviewerID *uuid.UUID `json:"reviewer_id"`
	Notes      *string    `json:"notes"`
}
type Service struct {
	db    *gorm.DB
	audit *audit.Service
}

func NewService(db *gorm.DB) *Service { return &Service{db: db, audit: audit.NewService()} }

func (s *Service) List(ctx context.Context, entityType string, entityID *uuid.UUID) ([]Review, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil {
		return nil, e
	}
	query := `SELECT id,entity_type,entity_id,reviewer_id,status,notes,created_at,updated_at FROM reviews WHERE tenant_id=$1`
	args := []any{p.TenantID}
	if entityType != "" {
		args = append(args, entityType)
		query += fmt.Sprintf(" AND entity_type=$%d", len(args))
	}
	if entityID != nil {
		args = append(args, *entityID)
		query += fmt.Sprintf(" AND entity_id=$%d", len(args))
	}
	query += " ORDER BY created_at DESC"
	rows, e := database.Rows(s.db, ctx, query, args...)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []Review{}
	for rows.Next() {
		var r Review
		if e = rows.Scan(&r.ID, &r.EntityType, &r.EntityID, &r.ReviewerID, &r.Status, &r.Notes, &r.CreatedAt, &r.UpdatedAt); e != nil {
			return nil, e
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
func (s *Service) Create(ctx context.Context, req CreateRequest) (Review, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil || p.ActorID == nil {
		return Review{}, fmt.Errorf("sign in required")
	}
	if req.EntityType != "task" && req.EntityType != "milestone" && req.EntityType != "project" {
		return Review{}, fmt.Errorf("invalid entity_type")
	}
	reviewer := *p.ActorID
	if req.ReviewerID != nil {
		reviewer = *req.ReviewerID
	}
	tx, e := database.Begin(s.db, ctx)
	if e != nil {
		return Review{}, e
	}
	defer database.Rollback(tx)
	var r Review
	e = database.Row(tx, ctx, `INSERT INTO reviews(tenant_id,entity_type,entity_id,reviewer_id,notes) VALUES($1,$2,$3,$4,$5) RETURNING id,entity_type,entity_id,reviewer_id,status,notes,created_at,updated_at`, p.TenantID, req.EntityType, req.EntityID, reviewer, req.Notes).Scan(&r.ID, &r.EntityType, &r.EntityID, &r.ReviewerID, &r.Status, &r.Notes, &r.CreatedAt, &r.UpdatedAt)
	if e != nil {
		return Review{}, e
	}
	if e = s.audit.Record(ctx, tx, audit.Event{TenantID: p.TenantID, ActorID: p.ActorID, ActorSource: p.Source, Action: "create", EntityType: "review", EntityID: r.ID, After: r}); e != nil {
		return Review{}, e
	}
	if e = database.Commit(tx); e != nil {
		return Review{}, e
	}
	return r, nil
}
func (s *Service) Update(ctx context.Context, id uuid.UUID, status string, notes *string) (Review, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil {
		return Review{}, e
	}
	if status != "approved" && status != "rejected" && status != "revision_requested" {
		return Review{}, fmt.Errorf("invalid status")
	}
	tx, e := database.Begin(s.db, ctx)
	if e != nil {
		return Review{}, e
	}
	defer database.Rollback(tx)
	var before, after Review
	scan := func(row database.RowScanner, r *Review) error {
		return row.Scan(&r.ID, &r.EntityType, &r.EntityID, &r.ReviewerID, &r.Status, &r.Notes, &r.CreatedAt, &r.UpdatedAt)
	}
	e = scan(database.Row(tx, ctx, `SELECT id,entity_type,entity_id,reviewer_id,status,notes,created_at,updated_at FROM reviews WHERE tenant_id=$1 AND id=$2 FOR UPDATE`, p.TenantID, id), &before)
	if e != nil {
		return Review{}, e
	}
	if before.ReviewerID != *p.ActorID {
		return Review{}, fmt.Errorf("reviewer permission required")
	}
	e = scan(database.Row(tx, ctx, `UPDATE reviews SET status=$3,notes=COALESCE($4,notes),updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,entity_type,entity_id,reviewer_id,status,notes,created_at,updated_at`, p.TenantID, id, status, notes), &after)
	if e != nil {
		return Review{}, e
	}
	if e = s.audit.Record(ctx, tx, audit.Event{TenantID: p.TenantID, ActorID: p.ActorID, ActorSource: p.Source, Action: "status_change", EntityType: "review", EntityID: id, Before: before, After: after}); e != nil {
		return Review{}, e
	}
	if after.EntityType == "project" {
		projectStatus := ""
		if status == "approved" {
			var outstanding int
			if e = database.Row(tx, ctx, `SELECT count(*) FROM reviews WHERE tenant_id=$1 AND entity_type='project' AND entity_id=$2 AND status<>'approved'`, p.TenantID, after.EntityID).Scan(&outstanding); e != nil {
				return Review{}, e
			}
			if outstanding == 0 {
				projectStatus = "done"
			}
		} else if status == "revision_requested" {
			projectStatus = "active"
		} else if status == "rejected" {
			projectStatus = "on_hold"
		}
		if projectStatus != "" {
			if _, e = database.Exec(tx, ctx, `UPDATE projects SET status=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL`, p.TenantID, after.EntityID, projectStatus); e != nil {
				return Review{}, e
			}
			if e = s.audit.Record(ctx, tx, audit.Event{TenantID: p.TenantID, ActorID: p.ActorID, ActorSource: p.Source, Action: "review_transition", EntityType: "project", EntityID: after.EntityID, After: map[string]any{"status": projectStatus, "review_id": after.ID}}); e != nil {
				return Review{}, e
			}
		}
	}
	if e = database.Commit(tx); e != nil {
		return Review{}, e
	}
	return after, nil
}
