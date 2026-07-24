package timetracking

import (
	"context"
	"fmt"
	"github.com/google/uuid"
	"github.com/npms-platform/npms/internal/audit"
	"github.com/npms-platform/npms/internal/platform/database"
	"github.com/npms-platform/npms/internal/tenant"
	"gorm.io/gorm"
	"time"
)

type Service struct {
	db         *gorm.DB
	repository *Repository
	audit      *audit.Service
}

func NewService(db *gorm.DB, r *Repository) *Service {
	return &Service{db: db, repository: r, audit: audit.NewService()}
}
func (s *Service) Start(ctx context.Context, taskID uuid.UUID) (StartResult, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil || p.ActorID == nil {
		return StartResult{}, fmt.Errorf("user required")
	}
	tx, e := database.Begin(s.db, ctx)
	if e != nil {
		return StartResult{}, e
	}
	defer database.Rollback(tx)
	result := StartResult{}
	previous, e := s.repository.Active(ctx, tx, p.TenantID, *p.ActorID)
	if e == nil {
		auto := time.Since(previous.StartedAt) > 12*time.Hour
		closed, ce := s.repository.Close(ctx, tx, p.TenantID, previous.ID, auto)
		if ce != nil {
			return result, ce
		}
		result.PreviousStopped = true
		result.Warning = "Previous active timer was stopped automatically"
		if ae := s.audit.Record(ctx, tx, audit.Event{TenantID: p.TenantID, ActorID: p.ActorID, ActorSource: p.Source, Action: "stop", EntityType: "time_entry", EntityID: closed.ID, Before: previous, After: closed}); ae != nil {
			return result, ae
		}
	} else if !database.IsNotFound(e) {
		return result, e
	}
	result.Entry, e = s.repository.Start(ctx, tx, p.TenantID, *p.ActorID, taskID)
	if e != nil {
		return result, e
	}
	if e = s.audit.Record(ctx, tx, audit.Event{TenantID: p.TenantID, ActorID: p.ActorID, ActorSource: p.Source, Action: "start", EntityType: "time_entry", EntityID: result.Entry.ID, After: result.Entry}); e != nil {
		return result, e
	}
	if e = database.Commit(tx); e != nil {
		return result, e
	}
	return result, nil
}
func (s *Service) Stop(ctx context.Context, id uuid.UUID) (Entry, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil || p.ActorID == nil {
		return Entry{}, fmt.Errorf("user required")
	}
	tx, e := database.Begin(s.db, ctx)
	if e != nil {
		return Entry{}, e
	}
	defer database.Rollback(tx)
	entry, e := s.repository.Close(ctx, tx, p.TenantID, id, false)
	if e != nil {
		return Entry{}, e
	}
	if entry.UserID != *p.ActorID {
		return Entry{}, database.ErrNotFound
	}
	if e = s.audit.Record(ctx, tx, audit.Event{TenantID: p.TenantID, ActorID: p.ActorID, ActorSource: p.Source, Action: "stop", EntityType: "time_entry", EntityID: entry.ID, After: entry}); e != nil {
		return Entry{}, e
	}
	if e = database.Commit(tx); e != nil {
		return Entry{}, e
	}
	return entry, nil
}
func (s *Service) List(ctx context.Context) ([]Entry, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil || p.ActorID == nil {
		return nil, fmt.Errorf("user required")
	}
	return s.repository.List(ctx, p.TenantID, *p.ActorID)
}
