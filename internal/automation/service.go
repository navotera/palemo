package automation

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/google/uuid"
	"github.com/npms-platform/npms/internal/audit"
	"github.com/npms-platform/npms/internal/platform/database"
	"github.com/npms-platform/npms/internal/tenant"
	"gorm.io/gorm"
	"time"
)

type Rule struct {
	ID           uuid.UUID       `json:"id"`
	Name         string          `json:"name"`
	TriggerEvent string          `json:"trigger_event"`
	Condition    json.RawMessage `json:"condition"`
	ActionType   string          `json:"action_type"`
	ActionConfig json.RawMessage `json:"action_config"`
	Active       bool            `json:"is_active"`
	CreatedAt    time.Time       `json:"created_at"`
	UpdatedAt    time.Time       `json:"updated_at"`
}
type CreateRequest struct {
	Name         string          `json:"name"`
	TriggerEvent string          `json:"trigger_event"`
	Condition    json.RawMessage `json:"condition"`
	ActionType   string          `json:"action_type"`
	ActionConfig json.RawMessage `json:"action_config"`
	Active       *bool           `json:"is_active"`
}
type event struct {
	ID, TenantID, EntityID uuid.UUID
	Name, EntityType       string
	Payload                json.RawMessage
	Depth                  int
}
type Service struct {
	db    *gorm.DB
	audit *audit.Service
}

func NewService(db *gorm.DB) *Service { return &Service{db: db, audit: audit.NewService()} }
func (s *Service) List(ctx context.Context) ([]Rule, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil {
		return nil, e
	}
	rows, e := database.Rows(s.db, ctx, `SELECT id,name,trigger_event,condition_json,action_type,action_config_json,is_active,created_at,updated_at FROM automation_rules WHERE tenant_id=$1 ORDER BY updated_at DESC`, p.TenantID)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []Rule{}
	for rows.Next() {
		var item Rule
		if e = rows.Scan(&item.ID, &item.Name, &item.TriggerEvent, &item.Condition, &item.ActionType, &item.ActionConfig, &item.Active, &item.CreatedAt, &item.UpdatedAt); e != nil {
			return nil, e
		}
		out = append(out, item)
	}
	return out, rows.Err()
}
func validAction(value string) bool {
	switch value {
	case "change_status", "send_notification", "create_task", "assign_review":
		return true
	}
	return false
}
func (s *Service) Create(ctx context.Context, request CreateRequest) (Rule, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil {
		return Rule{}, e
	}
	if request.Name == "" || request.TriggerEvent == "" || !validAction(request.ActionType) {
		return Rule{}, fmt.Errorf("name, trigger_event, and valid action_type required")
	}
	if len(request.Condition) == 0 {
		request.Condition = json.RawMessage(`{}`)
	}
	if len(request.ActionConfig) == 0 {
		request.ActionConfig = json.RawMessage(`{}`)
	}
	active := true
	if request.Active != nil {
		active = *request.Active
	}
	tx, e := database.Begin(s.db, ctx)
	if e != nil {
		return Rule{}, e
	}
	defer database.Rollback(tx)
	var item Rule
	e = database.Row(tx, ctx, `INSERT INTO automation_rules(tenant_id,name,trigger_event,condition_json,action_type,action_config_json,is_active) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,name,trigger_event,condition_json,action_type,action_config_json,is_active,created_at,updated_at`, p.TenantID, request.Name, request.TriggerEvent, request.Condition, request.ActionType, request.ActionConfig, active).Scan(&item.ID, &item.Name, &item.TriggerEvent, &item.Condition, &item.ActionType, &item.ActionConfig, &item.Active, &item.CreatedAt, &item.UpdatedAt)
	if e != nil {
		return Rule{}, e
	}
	if e = s.audit.Record(ctx, tx, audit.Event{TenantID: p.TenantID, ActorID: p.ActorID, ActorSource: p.Source, Action: "create", EntityType: "automation_rule", EntityID: item.ID, After: item}); e != nil {
		return Rule{}, e
	}
	if e = database.Commit(tx); e != nil {
		return Rule{}, e
	}
	return item, nil
}
func (s *Service) SetActive(ctx context.Context, id uuid.UUID, active bool) (Rule, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil {
		return Rule{}, e
	}
	tx, e := database.Begin(s.db, ctx)
	if e != nil {
		return Rule{}, e
	}
	defer database.Rollback(tx)
	var before, after Rule
	scan := func(row database.RowScanner, r *Rule) error {
		return row.Scan(&r.ID, &r.Name, &r.TriggerEvent, &r.Condition, &r.ActionType, &r.ActionConfig, &r.Active, &r.CreatedAt, &r.UpdatedAt)
	}
	if e = scan(database.Row(tx, ctx, `SELECT id,name,trigger_event,condition_json,action_type,action_config_json,is_active,created_at,updated_at FROM automation_rules WHERE tenant_id=$1 AND id=$2 FOR UPDATE`, p.TenantID, id), &before); e != nil {
		return Rule{}, e
	}
	if e = scan(database.Row(tx, ctx, `UPDATE automation_rules SET is_active=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,name,trigger_event,condition_json,action_type,action_config_json,is_active,created_at,updated_at`, p.TenantID, id, active), &after); e != nil {
		return Rule{}, e
	}
	if e = s.audit.Record(ctx, tx, audit.Event{TenantID: p.TenantID, ActorID: p.ActorID, ActorSource: p.Source, Action: "update", EntityType: "automation_rule", EntityID: id, Before: before, After: after}); e != nil {
		return Rule{}, e
	}
	if e = database.Commit(tx); e != nil {
		return Rule{}, e
	}
	return after, nil
}
func (s *Service) claim(ctx context.Context) (event, error) {
	tx, e := database.Begin(s.db, ctx)
	if e != nil {
		return event{}, e
	}
	defer database.Rollback(tx)
	var item event
	e = database.Row(tx, ctx, `SELECT id,tenant_id,event,entity_type,entity_id,payload_json,depth FROM automation_events WHERE status='pending' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`).Scan(&item.ID, &item.TenantID, &item.Name, &item.EntityType, &item.EntityID, &item.Payload, &item.Depth)
	if e != nil {
		return event{}, e
	}
	if _, e = database.Exec(tx, ctx, `UPDATE automation_events SET status='processing' WHERE id=$1`, item.ID); e != nil {
		return event{}, e
	}
	return item, database.Commit(tx)
}
func matches(condition, payload json.RawMessage) bool {
	var wanted, actual map[string]any
	if json.Unmarshal(condition, &wanted) != nil || json.Unmarshal(payload, &actual) != nil {
		return false
	}
	for key, value := range wanted {
		if fmt.Sprint(actual[key]) != fmt.Sprint(value) {
			return false
		}
	}
	return true
}
func (s *Service) ProcessOne(ctx context.Context) error {
	item, e := s.claim(ctx)
	if database.IsNotFound(e) {
		return nil
	}
	if e != nil {
		return e
	}
	rows, e := database.Rows(s.db, ctx, `SELECT id,name,trigger_event,condition_json,action_type,action_config_json,is_active,created_at,updated_at FROM automation_rules WHERE tenant_id=$1 AND trigger_event=$2 AND is_active`, item.TenantID, item.Name)
	if e != nil {
		return s.fail(ctx, item.ID, e)
	}
	rules := []Rule{}
	for rows.Next() {
		var rule Rule
		if e = rows.Scan(&rule.ID, &rule.Name, &rule.TriggerEvent, &rule.Condition, &rule.ActionType, &rule.ActionConfig, &rule.Active, &rule.CreatedAt, &rule.UpdatedAt); e != nil {
			rows.Close()
			return s.fail(ctx, item.ID, e)
		}
		rules = append(rules, rule)
	}
	rows.Close()
	for _, rule := range rules {
		if !matches(rule.Condition, item.Payload) {
			continue
		}
		if e = s.execute(ctx, item, rule); e != nil {
			return s.fail(ctx, item.ID, e)
		}
	}
	_, e = database.Exec(s.db, ctx, `UPDATE automation_events SET status='completed',processed_at=now() WHERE id=$1`, item.ID)
	return e
}
func (s *Service) fail(ctx context.Context, id uuid.UUID, cause error) error {
	_, _ = database.Exec(s.db, ctx, `UPDATE automation_events SET status='failed',error=$2,processed_at=now() WHERE id=$1`, id, cause.Error())
	return cause
}
func (s *Service) execute(ctx context.Context, item event, rule Rule) error {
	tx, e := database.Begin(s.db, ctx)
	if e != nil {
		return e
	}
	defer database.Rollback(tx)
	var config map[string]any
	_ = json.Unmarshal(rule.ActionConfig, &config)
	result := map[string]any{"rule_id": rule.ID, "event_id": item.ID, "action": rule.ActionType}
	switch rule.ActionType {
	case "change_status":
		column := fmt.Sprint(config["board_column"])
		if column == "" {
			column = "review"
		}
		var beforeTitle, beforeColumn string
		e = database.Row(tx, ctx, `SELECT title,board_column FROM tasks WHERE tenant_id=$1 AND id=$2 FOR UPDATE`, item.TenantID, item.EntityID).Scan(&beforeTitle, &beforeColumn)
		if e != nil {
			return e
		}
		_, e = database.Exec(tx, ctx, `UPDATE tasks SET board_column=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2`, item.TenantID, item.EntityID, column)
		if e != nil {
			return e
		}
		e = s.audit.Record(ctx, tx, audit.Event{TenantID: item.TenantID, ActorSource: "automation_engine", Action: "status_change", EntityType: "task", EntityID: item.EntityID, Before: map[string]any{"title": beforeTitle, "board_column": beforeColumn}, After: map[string]any{"title": beforeTitle, "board_column": column, "rule_id": rule.ID}})
	case "send_notification":
		recipient, e2 := uuid.Parse(fmt.Sprint(config["recipient_id"]))
		if e2 != nil {
			return e2
		}
		template := fmt.Sprint(config["template"])
		if template == "" {
			template = "automation_notice"
		}
		_, e = database.Exec(tx, ctx, `INSERT INTO notifications(tenant_id,recipient_id,channel,template,payload_json) VALUES($1,$2,'dashboard',$3,$4)`, item.TenantID, recipient, template, item.Payload)
	case "create_task":
		projectID, e2 := uuid.Parse(fmt.Sprint(config["project_id"]))
		if e2 != nil && item.EntityType == "project" {
			projectID = item.EntityID
			e2 = nil
		}
		if e2 != nil {
			return e2
		}
		title := fmt.Sprint(config["title"])
		if title == "" {
			title = "Automated follow-up"
		}
		var taskID uuid.UUID
		e = database.Row(tx, ctx, `INSERT INTO tasks(tenant_id,project_id,title) VALUES($1,$2,$3) RETURNING id`, item.TenantID, projectID, title).Scan(&taskID)
		result["task_id"] = taskID
	case "assign_review":
		reviewer, e2 := uuid.Parse(fmt.Sprint(config["reviewer_id"]))
		if e2 != nil {
			return e2
		}
		var reviewID uuid.UUID
		e = database.Row(tx, ctx, `INSERT INTO reviews(tenant_id,entity_type,entity_id,reviewer_id) VALUES($1,$2,$3,$4) RETURNING id`, item.TenantID, item.EntityType, item.EntityID, reviewer).Scan(&reviewID)
		result["review_id"] = reviewID
	}
	if e != nil {
		return e
	}
	var runID uuid.UUID
	e = database.Row(tx, ctx, `INSERT INTO automation_runs(tenant_id,rule_id,event_id,status,result_json,completed_at) VALUES($1,$2,$3,'completed',$4,now()) RETURNING id`, item.TenantID, rule.ID, item.ID, result).Scan(&runID)
	if e != nil {
		return e
	}
	if e = s.audit.Record(ctx, tx, audit.Event{TenantID: item.TenantID, ActorSource: "automation_engine", Action: "execute", EntityType: "automation_rule", EntityID: rule.ID, After: map[string]any{"run_id": runID, "event_id": item.ID, "result": result}}); e != nil {
		return e
	}
	return database.Commit(tx)
}
func StartWorker(ctx context.Context, db *gorm.DB) {
	service := NewService(db)
	go func() {
		ticker := time.NewTicker(2 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				_ = service.ProcessOne(ctx)
			}
		}
	}()
}
