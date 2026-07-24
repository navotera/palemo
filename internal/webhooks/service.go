package webhooks

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"github.com/npms-platform/npms/internal/platform/database"
	"gorm.io/gorm"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/npms-platform/npms/internal/audit"
	"github.com/npms-platform/npms/internal/tenant"
)

type Subscription struct {
	ID          uuid.UUID `json:"id"`
	APIClientID uuid.UUID `json:"api_client_id"`
	Event       string    `json:"event"`
	TargetURL   string    `json:"target_url"`
	Active      bool      `json:"is_active"`
	Failures    int       `json:"consecutive_failures"`
	CreatedAt   time.Time `json:"created_at"`
}
type Delivery struct {
	ID             uuid.UUID  `json:"id"`
	SubscriptionID uuid.UUID  `json:"subscription_id"`
	Event          string     `json:"event"`
	Attempt        int        `json:"attempt"`
	Status         string     `json:"status"`
	ResponseCode   *int       `json:"response_code"`
	ResponseBody   *string    `json:"response_body"`
	NextAttempt    *time.Time `json:"next_attempt_at"`
	DeliveredAt    *time.Time `json:"delivered_at"`
	CreatedAt      time.Time  `json:"created_at"`
}
type CreateRequest struct {
	Event       string     `json:"event"`
	TargetURL   string     `json:"target_url"`
	Secret      string     `json:"secret"`
	APIClientID *uuid.UUID `json:"api_client_id"`
}
type Service struct {
	db    *gorm.DB
	audit *audit.Service
	http  *http.Client
}

func NewService(db *gorm.DB) *Service {
	return &Service{db: db, audit: audit.NewService(), http: &http.Client{Timeout: 10 * time.Second}}
}
func validEvent(value string) bool {
	switch value {
	case "project.created", "project.status_changed", "task.completed", "milestone.completed", "report.ready":
		return true
	}
	return false
}
func (s *Service) List(ctx context.Context) ([]Subscription, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil {
		return nil, e
	}
	rows, e := database.Rows(s.db, ctx, `SELECT id,api_client_id,event,target_url,is_active,consecutive_failures,created_at FROM webhook_subscriptions WHERE tenant_id=$1 ORDER BY created_at DESC`, p.TenantID)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []Subscription{}
	for rows.Next() {
		var item Subscription
		if e = rows.Scan(&item.ID, &item.APIClientID, &item.Event, &item.TargetURL, &item.Active, &item.Failures, &item.CreatedAt); e != nil {
			return nil, e
		}
		out = append(out, item)
	}
	return out, rows.Err()
}
func (s *Service) Deliveries(ctx context.Context) ([]Delivery, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil {
		return nil, e
	}
	rows, e := database.Rows(s.db, ctx, `SELECT id,subscription_id,event,attempt,status,response_code,response_body,next_attempt_at,delivered_at,created_at FROM webhook_deliveries WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 100`, p.TenantID)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []Delivery{}
	for rows.Next() {
		var item Delivery
		if e = rows.Scan(&item.ID, &item.SubscriptionID, &item.Event, &item.Attempt, &item.Status, &item.ResponseCode, &item.ResponseBody, &item.NextAttempt, &item.DeliveredAt, &item.CreatedAt); e != nil {
			return nil, e
		}
		out = append(out, item)
	}
	return out, rows.Err()
}
func (s *Service) Create(ctx context.Context, request CreateRequest) (Subscription, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil {
		return Subscription{}, e
	}
	if !validEvent(request.Event) {
		return Subscription{}, fmt.Errorf("unsupported event")
	}
	parsed, e := url.ParseRequestURI(request.TargetURL)
	if e != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return Subscription{}, fmt.Errorf("valid HTTP target_url required")
	}
	if len(request.Secret) < 16 {
		return Subscription{}, fmt.Errorf("secret must contain at least 16 characters")
	}
	clientID := request.APIClientID
	if p.APIClientID != nil {
		clientID = p.APIClientID
	}
	if clientID == nil {
		return Subscription{}, fmt.Errorf("api_client_id required")
	}
	tx, e := database.Begin(s.db, ctx)
	if e != nil {
		return Subscription{}, e
	}
	defer database.Rollback(tx)
	var item Subscription
	e = database.Row(tx, ctx, `INSERT INTO webhook_subscriptions(tenant_id,api_client_id,event,target_url,secret) SELECT $1,$2,$3,$4,$5 WHERE EXISTS(SELECT 1 FROM api_clients WHERE tenant_id=$1 AND id=$2 AND is_active) RETURNING id,api_client_id,event,target_url,is_active,consecutive_failures,created_at`, p.TenantID, *clientID, request.Event, request.TargetURL, request.Secret).Scan(&item.ID, &item.APIClientID, &item.Event, &item.TargetURL, &item.Active, &item.Failures, &item.CreatedAt)
	if e != nil {
		return Subscription{}, e
	}
	if e = s.audit.Record(ctx, tx, audit.Event{TenantID: p.TenantID, ActorID: p.ActorID, ActorSource: p.Source, Action: "create", EntityType: "webhook_subscription", EntityID: item.ID, After: item}); e != nil {
		return Subscription{}, e
	}
	if e = database.Commit(tx); e != nil {
		return Subscription{}, e
	}
	return item, nil
}
func (s *Service) Disable(ctx context.Context, id uuid.UUID) error {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil {
		return e
	}
	tx, e := database.Begin(s.db, ctx)
	if e != nil {
		return e
	}
	defer database.Rollback(tx)
	var before Subscription
	e = database.Row(tx, ctx, `SELECT id,api_client_id,event,target_url,is_active,consecutive_failures,created_at FROM webhook_subscriptions WHERE tenant_id=$1 AND id=$2 FOR UPDATE`, p.TenantID, id).Scan(&before.ID, &before.APIClientID, &before.Event, &before.TargetURL, &before.Active, &before.Failures, &before.CreatedAt)
	if e != nil {
		return e
	}
	after := before
	after.Active = false
	if _, e = database.Exec(tx, ctx, `UPDATE webhook_subscriptions SET is_active=false,updated_at=now() WHERE tenant_id=$1 AND id=$2`, p.TenantID, id); e != nil {
		return e
	}
	if e = s.audit.Record(ctx, tx, audit.Event{TenantID: p.TenantID, ActorID: p.ActorID, ActorSource: p.Source, Action: "update", EntityType: "webhook_subscription", EntityID: id, Before: before, After: after}); e != nil {
		return e
	}
	return database.Commit(tx)
}
func signature(secret string, payload []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	return "sha256=" + hex.EncodeToString(mac.Sum(nil))
}
func (s *Service) DeliverOne(ctx context.Context) error {
	tx, e := database.Begin(s.db, ctx)
	if e != nil {
		return e
	}
	defer database.Rollback(tx)
	var id, subscriptionID, tenantID uuid.UUID
	var event, target, secret string
	var payload []byte
	var attempt int
	e = database.Row(tx, ctx, `SELECT d.id,d.subscription_id,d.tenant_id,d.event,d.payload_json,d.attempt,s.target_url,s.secret FROM webhook_deliveries d JOIN webhook_subscriptions s ON s.id=d.subscription_id WHERE d.status IN('pending','failed') AND d.next_attempt_at<=now() AND s.is_active ORDER BY d.next_attempt_at FOR UPDATE OF d SKIP LOCKED LIMIT 1`).Scan(&id, &subscriptionID, &tenantID, &event, &payload, &attempt, &target, &secret)
	if database.IsNotFound(e) {
		return nil
	}
	if e != nil {
		return e
	}
	if e = database.Commit(tx); e != nil {
		return e
	}
	request, e := http.NewRequestWithContext(ctx, http.MethodPost, target, strings.NewReader(string(payload)))
	if e != nil {
		return e
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-NPMS-Event", event)
	request.Header.Set("X-NPMS-Signature", signature(secret, payload))
	response, e := s.http.Do(request)
	code := 0
	body := ""
	if e == nil {
		code = response.StatusCode
		raw, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		response.Body.Close()
		body = string(raw)
	}
	success := e == nil && code >= 200 && code < 300
	return s.recordAttempt(ctx, id, subscriptionID, tenantID, attempt, success, code, body)
}
func (s *Service) recordAttempt(ctx context.Context, id, subscriptionID, tenantID uuid.UUID, attempt int, success bool, code int, body string) error {
	tx, e := database.Begin(s.db, ctx)
	if e != nil {
		return e
	}
	defer database.Rollback(tx)
	if success {
		_, e = database.Exec(tx, ctx, `UPDATE webhook_deliveries SET status='delivered',response_code=$2,response_body=$3,delivered_at=now(),updated_at=now() WHERE id=$1`, id, code, body)
		if e == nil {
			_, e = database.Exec(tx, ctx, `UPDATE webhook_subscriptions SET consecutive_failures=0,updated_at=now() WHERE id=$1`, subscriptionID)
		}
		if e != nil {
			return e
		}
		return database.Commit(tx)
	}
	next := attempt + 1
	if next > 5 {
		_, e = database.Exec(tx, ctx, `UPDATE webhook_deliveries SET status='disabled',response_code=NULLIF($2,0),response_body=$3,attempt=$4,updated_at=now() WHERE id=$1`, id, code, body, next)
		if e == nil {
			_, e = database.Exec(tx, ctx, `UPDATE webhook_subscriptions SET is_active=false,consecutive_failures=$2,updated_at=now() WHERE id=$1`, subscriptionID, next)
		}
		if e == nil {
			_, e = database.Exec(tx, ctx, `INSERT INTO notifications(tenant_id,recipient_id,channel,template,payload_json) SELECT $1,id,'dashboard','webhook_disabled',jsonb_build_object('subscription_id',$2::text) FROM users WHERE tenant_id=$1 AND role='admin' ORDER BY created_at LIMIT 1`, tenantID, subscriptionID)
		}
		if e != nil {
			return e
		}
		return database.Commit(tx)
	}
	delay := time.Duration(1<<(next-1)) * time.Minute
	_, e = database.Exec(tx, ctx, `UPDATE webhook_deliveries SET status='failed',response_code=NULLIF($2,0),response_body=$3,attempt=$4,next_attempt_at=$5,updated_at=now() WHERE id=$1`, id, code, body, next, time.Now().Add(delay))
	if e == nil {
		_, e = database.Exec(tx, ctx, `UPDATE webhook_subscriptions SET consecutive_failures=consecutive_failures+1,updated_at=now() WHERE id=$1`, subscriptionID)
	}
	if e != nil {
		return e
	}
	return database.Commit(tx)
}
func StartWorker(ctx context.Context, db *gorm.DB) {
	service := NewService(db)
	go func() {
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				_ = service.DeliverOne(ctx)
			}
		}
	}()
}
func Payload(value any) json.RawMessage { raw, _ := json.Marshal(value); return raw }
