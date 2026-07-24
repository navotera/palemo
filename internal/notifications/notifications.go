package notifications

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/npms-platform/npms/internal/platform/database"
	"gorm.io/gorm"
	"time"

	"github.com/google/uuid"
	"github.com/npms-platform/npms/internal/audit"
	"github.com/npms-platform/npms/internal/tenant"
)

type Notification struct {
	ID          uuid.UUID       `json:"id"`
	RecipientID uuid.UUID       `json:"recipient_id"`
	Channel     string          `json:"channel"`
	Template    string          `json:"template"`
	Payload     json.RawMessage `json:"payload"`
	Status      string          `json:"status"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
}
type CreateRequest struct {
	Channel     string          `json:"channel"`
	RecipientID uuid.UUID       `json:"recipient_id"`
	Template    string          `json:"template"`
	Payload     json.RawMessage `json:"payload"`
}
type Service struct {
	db    *gorm.DB
	audit *audit.Service
}

func NewService(db *gorm.DB) *Service { return &Service{db: db, audit: audit.NewService()} }
func (s *Service) List(ctx context.Context) ([]Notification, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil || p.ActorID == nil {
		return nil, fmt.Errorf("user session required")
	}
	rows, e := database.Rows(s.db, ctx, `SELECT id,recipient_id,channel,template,payload_json,status,created_at,updated_at FROM notifications WHERE tenant_id=$1 AND recipient_id=$2 ORDER BY created_at DESC LIMIT 100`, p.TenantID, *p.ActorID)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []Notification{}
	for rows.Next() {
		var item Notification
		if e = rows.Scan(&item.ID, &item.RecipientID, &item.Channel, &item.Template, &item.Payload, &item.Status, &item.CreatedAt, &item.UpdatedAt); e != nil {
			return nil, e
		}
		out = append(out, item)
	}
	return out, rows.Err()
}
func (s *Service) Create(ctx context.Context, request CreateRequest) (Notification, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil {
		return Notification{}, e
	}
	if request.Channel != "email" && request.Channel != "dashboard" {
		return Notification{}, fmt.Errorf("channel must be email or dashboard")
	}
	if request.Template == "" || request.RecipientID == uuid.Nil {
		return Notification{}, fmt.Errorf("recipient_id and template required")
	}
	if len(request.Payload) == 0 {
		request.Payload = json.RawMessage(`{}`)
	}
	tx, e := database.Begin(s.db, ctx)
	if e != nil {
		return Notification{}, e
	}
	defer database.Rollback(tx)
	var item Notification
	e = database.Row(tx, ctx, `INSERT INTO notifications(tenant_id,recipient_id,channel,template,payload_json) SELECT $1,$2,$3,$4,$5 WHERE EXISTS(SELECT 1 FROM users WHERE tenant_id=$1 AND id=$2) RETURNING id,recipient_id,channel,template,payload_json,status,created_at,updated_at`, p.TenantID, request.RecipientID, request.Channel, request.Template, request.Payload).Scan(&item.ID, &item.RecipientID, &item.Channel, &item.Template, &item.Payload, &item.Status, &item.CreatedAt, &item.UpdatedAt)
	if e != nil {
		return Notification{}, e
	}
	if e = s.audit.Record(ctx, tx, audit.Event{TenantID: p.TenantID, ActorID: p.ActorID, ActorSource: p.Source, Action: "create", EntityType: "notification", EntityID: item.ID, After: item}); e != nil {
		return Notification{}, e
	}
	if e = database.Commit(tx); e != nil {
		return Notification{}, e
	}
	return item, nil
}
func (s *Service) Read(ctx context.Context, id uuid.UUID) (Notification, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil || p.ActorID == nil {
		return Notification{}, fmt.Errorf("user session required")
	}
	tx, e := database.Begin(s.db, ctx)
	if e != nil {
		return Notification{}, e
	}
	defer database.Rollback(tx)
	var before, after Notification
	scan := func(row database.RowScanner, item *Notification) error {
		return row.Scan(&item.ID, &item.RecipientID, &item.Channel, &item.Template, &item.Payload, &item.Status, &item.CreatedAt, &item.UpdatedAt)
	}
	e = scan(database.Row(tx, ctx, `SELECT id,recipient_id,channel,template,payload_json,status,created_at,updated_at FROM notifications WHERE tenant_id=$1 AND recipient_id=$2 AND id=$3 FOR UPDATE`, p.TenantID, *p.ActorID, id), &before)
	if e != nil {
		return Notification{}, e
	}
	e = scan(database.Row(tx, ctx, `UPDATE notifications SET status='read',updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,recipient_id,channel,template,payload_json,status,created_at,updated_at`, p.TenantID, id), &after)
	if e != nil {
		return Notification{}, e
	}
	if e = s.audit.Record(ctx, tx, audit.Event{TenantID: p.TenantID, ActorID: p.ActorID, ActorSource: p.Source, Action: "update", EntityType: "notification", EntityID: id, Before: before, After: after}); e != nil {
		return Notification{}, e
	}
	if e = database.Commit(tx); e != nil {
		return Notification{}, e
	}
	return after, nil
}
