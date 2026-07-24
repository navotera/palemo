package organization

import (
	"context"
	"fmt"
	"github.com/google/uuid"
	"github.com/npms-platform/npms/internal/audit"
	"github.com/npms-platform/npms/internal/platform/database"
	"github.com/npms-platform/npms/internal/tenant"
	"gorm.io/gorm"
	"strings"
)

type Service struct {
	db         *gorm.DB
	repository *Repository
	audit      *audit.Service
}

func NewService(db *gorm.DB, r *Repository) *Service {
	return &Service{db: db, repository: r, audit: audit.NewService()}
}
func (s *Service) List(ctx context.Context) ([]Division, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil {
		return nil, e
	}
	return s.repository.List(ctx, p.TenantID)
}
func (s *Service) Create(ctx context.Context, q CreateRequest) (Division, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil || p.ActorID == nil {
		return Division{}, fmt.Errorf("user session required")
	}
	role, e := s.repository.Role(ctx, p.TenantID, *p.ActorID)
	if e != nil || !(role == "admin" || role == "manager") {
		return Division{}, fmt.Errorf("admin or manager role required")
	}
	q.Name = strings.TrimSpace(q.Name)
	q.InitialTeamName = strings.TrimSpace(q.InitialTeamName)
	if q.Name == "" {
		return Division{}, fmt.Errorf("name required")
	}
	tx, e := database.Begin(s.db, ctx)
	if e != nil {
		return Division{}, e
	}
	defer database.Rollback(tx)
	exists, e := s.repository.NameExists(ctx, tx, p.TenantID, q.Name)
	if e != nil {
		return Division{}, e
	}
	if exists {
		return Division{}, fmt.Errorf("division name already exists")
	}
	if q.ParentDivisionID != nil {
		exists, e = s.repository.ParentExists(ctx, tx, p.TenantID, *q.ParentDivisionID)
		if e != nil {
			return Division{}, e
		}
		if !exists {
			return Division{}, fmt.Errorf("parent division not found")
		}
	}
	division, e := s.repository.Create(ctx, tx, p.TenantID, q)
	if e != nil {
		return Division{}, e
	}
	if e = s.audit.Record(ctx, tx, audit.Event{TenantID: p.TenantID, ActorID: p.ActorID, ActorSource: p.Source, Action: "create", EntityType: "division", EntityID: division.ID, After: division}); e != nil {
		return Division{}, e
	}
	if e = database.Commit(tx); e != nil {
		return Division{}, e
	}
	return division, nil
}

func (s *Service) SetLeads(ctx context.Context, divisionID uuid.UUID, q SetLeadsRequest) (Division, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil || p.ActorID == nil {
		return Division{}, fmt.Errorf("user session required")
	}
	role, e := s.repository.Role(ctx, p.TenantID, *p.ActorID)
	if e != nil || role != "admin" {
		return Division{}, fmt.Errorf("admin role required")
	}
	unique := []uuid.UUID{}
	seen := map[uuid.UUID]bool{}
	for _, id := range q.UserIDs {
		if id != uuid.Nil && !seen[id] {
			seen[id] = true
			unique = append(unique, id)
		}
	}
	tx, e := database.Begin(s.db, ctx)
	if e != nil {
		return Division{}, e
	}
	defer database.Rollback(tx)
	exists, e := s.repository.DivisionExists(ctx, tx, p.TenantID, divisionID)
	if e != nil {
		return Division{}, e
	}
	if !exists {
		return Division{}, fmt.Errorf("division not found")
	}
	exists, e = s.repository.UsersExist(ctx, tx, p.TenantID, unique)
	if e != nil {
		return Division{}, e
	}
	if !exists {
		return Division{}, fmt.Errorf("one or more users not found")
	}
	before, e := s.repository.leadUserIDs(ctx, p.TenantID, divisionID)
	if e != nil {
		return Division{}, e
	}
	if e = s.repository.ReplaceLeads(ctx, tx, p.TenantID, divisionID, unique); e != nil {
		return Division{}, e
	}
	if e = s.audit.Record(ctx, tx, audit.Event{TenantID: p.TenantID, ActorID: p.ActorID, ActorSource: p.Source, Action: "assign_leads", EntityType: "division", EntityID: divisionID, Before: map[string]any{"lead_user_ids": before}, After: map[string]any{"lead_user_ids": unique}}); e != nil {
		return Division{}, e
	}
	if e = database.Commit(tx); e != nil {
		return Division{}, e
	}
	items, e := s.repository.List(ctx, p.TenantID)
	if e != nil {
		return Division{}, e
	}
	for _, item := range items {
		if item.ID == divisionID {
			return item, nil
		}
	}
	return Division{}, fmt.Errorf("division not found")
}
