package tasks

import (
	"context"
	"fmt"
	"github.com/npms-platform/npms/internal/platform/database"
	"gorm.io/gorm"
	"strings"

	"github.com/google/uuid"
	"github.com/npms-platform/npms/internal/audit"
	"github.com/npms-platform/npms/internal/tenant"
)

var allowedColumns = map[string]bool{"todo": true, "in_progress": true, "review": true, "done": true}

type Service struct {
	db         *gorm.DB
	repository *Repository
	audit      *audit.Service
}

func NewService(db *gorm.DB, repository *Repository) *Service {
	return &Service{db: db, repository: repository, audit: audit.NewService()}
}
func (s *Service) List(ctx context.Context, projectID uuid.UUID) ([]Task, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil {
		return nil, e
	}
	return s.repository.List(ctx, p.TenantID, projectID)
}
func (s *Service) Create(ctx context.Context, request CreateRequest) (Task, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil {
		return Task{}, e
	}
	if strings.TrimSpace(request.Title) == "" || request.ProjectID == uuid.Nil {
		return Task{}, fmt.Errorf("title and project_id are required")
	}
	tx, e := database.Begin(s.db, ctx)
	if e != nil {
		return Task{}, e
	}
	defer database.Rollback(tx)
	item, e := s.repository.Create(ctx, tx, p.TenantID, request)
	if e != nil {
		return Task{}, e
	}
	if e = s.audit.Record(ctx, tx, audit.Event{TenantID: p.TenantID, ActorID: p.ActorID, ActorSource: p.Source, Action: "create", EntityType: "task", EntityID: item.ID, After: item}); e != nil {
		return Task{}, e
	}
	if e = database.Commit(tx); e != nil {
		return Task{}, e
	}
	return item, nil
}
func (s *Service) UpdateBoard(ctx context.Context, id uuid.UUID, request UpdateRequest) (Task, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil {
		return Task{}, e
	}
	if !allowedColumns[request.BoardColumn] || request.Position < 0 {
		return Task{}, fmt.Errorf("invalid board_column or position")
	}
	tx, e := database.Begin(s.db, ctx)
	if e != nil {
		return Task{}, e
	}
	defer database.Rollback(tx)
	before, e := s.repository.GetForUpdate(ctx, tx, p.TenantID, id)
	if e != nil {
		return Task{}, e
	}
	after, e := s.repository.UpdateBoard(ctx, tx, p.TenantID, id, request)
	if e != nil {
		return Task{}, e
	}
	action := "update"
	if before.BoardColumn != after.BoardColumn {
		action = "status_change"
	}
	if e = s.audit.Record(ctx, tx, audit.Event{TenantID: p.TenantID, ActorID: p.ActorID, ActorSource: p.Source, Action: action, EntityType: "task", EntityID: id, Before: before, After: after}); e != nil {
		return Task{}, e
	}
	if e = database.Commit(tx); e != nil {
		return Task{}, e
	}
	return after, nil
}
