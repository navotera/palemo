package audit

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"github.com/npms-platform/npms/internal/platform/database"
	"gorm.io/gorm"
)

type Event struct {
	TenantID    uuid.UUID
	ActorID     *uuid.UUID
	ActorSource string
	Action      string
	EntityType  string
	EntityID    uuid.UUID
	Before      any
	After       any
	RequestID   *uuid.UUID
}

type Service struct{}

func NewService() *Service { return &Service{} }

func (s *Service) Record(ctx context.Context, db *gorm.DB, event Event) error {
	beforeJSON, err := marshalNullable(event.Before)
	if err != nil {
		return fmt.Errorf("marshal before state: %w", err)
	}
	afterJSON, err := marshalNullable(event.After)
	if err != nil {
		return fmt.Errorf("marshal after state: %w", err)
	}
	_, err = database.Exec(db, ctx, `
		INSERT INTO audit_events
		(tenant_id, actor_id, actor_source, action, entity_type, entity_id, before_json, after_json, request_id)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, event.TenantID, event.ActorID,
		event.ActorSource, event.Action, event.EntityType, event.EntityID, beforeJSON, afterJSON, event.RequestID)
	if err != nil {
		return fmt.Errorf("insert audit event: %w", err)
	}
	return nil
}

func marshalNullable(value any) ([]byte, error) {
	if value == nil {
		return nil, nil
	}
	return json.Marshal(value)
}
