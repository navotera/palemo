package assistant

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/google/uuid"
	"github.com/npms-platform/npms/internal/audit"
	"github.com/npms-platform/npms/internal/platform/database"
	"github.com/npms-platform/npms/internal/tenant"
	"gorm.io/gorm"
	"strings"
	"time"
)

type Evidence struct {
	Label  string `json:"label"`
	Value  any    `json:"value"`
	Source string `json:"source"`
}
type Answer struct {
	ID        uuid.UUID  `json:"id"`
	Question  string     `json:"question"`
	Answer    string     `json:"answer"`
	Evidence  []Evidence `json:"evidence"`
	CreatedAt time.Time  `json:"created_at"`
}
type Service struct {
	db    *gorm.DB
	audit *audit.Service
}

func NewService(db *gorm.DB) *Service { return &Service{db: db, audit: audit.NewService()} }
func (s *Service) Query(ctx context.Context, question string) (Answer, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil || p.ActorID == nil {
		return Answer{}, fmt.Errorf("user session required")
	}
	question = strings.TrimSpace(question)
	if question == "" {
		return Answer{}, fmt.Errorf("question required")
	}
	lower := strings.ToLower(question)
	evidence := []Evidence{}
	answer := ""
	if strings.Contains(lower, "hour") || strings.Contains(lower, "productiv") {
		var seconds int64
		var completed, pending int
		e = database.Row(s.db, ctx, `SELECT COALESCE(sum(duration_seconds)FILTER(WHERE ended_at IS NOT NULL AND NOT auto_closed),0) FROM time_entries WHERE tenant_id=$1`, p.TenantID).Scan(&seconds)
		if e != nil {
			return Answer{}, e
		}
		e = database.Row(s.db, ctx, `SELECT count(*)FILTER(WHERE board_column='done'),count(*)FILTER(WHERE board_column<>'done' AND deleted_at IS NULL) FROM tasks WHERE tenant_id=$1`, p.TenantID).Scan(&completed, &pending)
		if e != nil {
			return Answer{}, e
		}
		evidence = []Evidence{{"Tracked hours", float64(seconds) / 3600, "time_entries"}, {"Completed tasks", completed, "tasks"}, {"Open tasks", pending, "tasks"}}
		answer = fmt.Sprintf("The tenant has tracked %.1f verified hours, completed %d tasks, and has %d open tasks.", float64(seconds)/3600, completed, pending)
	} else if strings.Contains(lower, "audit") || strings.Contains(lower, "activity") {
		rows, e := database.Rows(s.db, ctx, `SELECT action,entity_type,count(*) FROM audit_events WHERE tenant_id=$1 GROUP BY action,entity_type ORDER BY count(*) DESC LIMIT 5`, p.TenantID)
		if e != nil {
			return Answer{}, e
		}
		defer rows.Close()
		parts := []string{}
		for rows.Next() {
			var action, entity string
			var count int
			if e = rows.Scan(&action, &entity, &count); e != nil {
				return Answer{}, e
			}
			parts = append(parts, fmt.Sprintf("%d %s %s events", count, entity, action))
			evidence = append(evidence, Evidence{entity + " " + action, count, "audit_events"})
		}
		answer = "Most frequent audited activity: " + strings.Join(parts, ", ") + "."
	} else {
		var projects, openTasks, reviews, knowledge int
		e = database.Row(s.db, ctx, `SELECT (SELECT count(*) FROM projects WHERE tenant_id=$1 AND deleted_at IS NULL),(SELECT count(*) FROM tasks WHERE tenant_id=$1 AND deleted_at IS NULL AND board_column<>'done'),(SELECT count(*) FROM reviews WHERE tenant_id=$1 AND status='pending'),(SELECT count(*) FROM wiki_pages WHERE tenant_id=$1 AND deleted_at IS NULL)`, p.TenantID).Scan(&projects, &openTasks, &reviews, &knowledge)
		if e != nil {
			return Answer{}, e
		}
		evidence = []Evidence{{"Projects", projects, "projects"}, {"Open tasks", openTasks, "tasks"}, {"Pending reviews", reviews, "reviews"}, {"Wiki pages", knowledge, "wiki_pages"}}
		answer = fmt.Sprintf("Current tenant overview: %d projects, %d open tasks, %d pending reviews, and %d wiki pages.", projects, openTasks, reviews, knowledge)
	}
	raw, _ := json.Marshal(evidence)
	tx, e := database.Begin(s.db, ctx)
	if e != nil {
		return Answer{}, e
	}
	defer database.Rollback(tx)
	result := Answer{Question: question, Answer: answer, Evidence: evidence}
	e = database.Row(tx, ctx, `INSERT INTO ai_query_history(tenant_id,user_id,question,answer,evidence_json) VALUES($1,$2,$3,$4,$5) RETURNING id,created_at`, p.TenantID, *p.ActorID, question, answer, raw).Scan(&result.ID, &result.CreatedAt)
	if e != nil {
		return Answer{}, e
	}
	if e = s.audit.Record(ctx, tx, audit.Event{TenantID: p.TenantID, ActorID: p.ActorID, ActorSource: "assistant_query", Action: "query", EntityType: "ai_query", EntityID: result.ID, After: map[string]any{"question": question, "evidence": evidence}}); e != nil {
		return Answer{}, e
	}
	if e = database.Commit(tx); e != nil {
		return Answer{}, e
	}
	return result, nil
}
func (s *Service) History(ctx context.Context) ([]Answer, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil || p.ActorID == nil {
		return nil, fmt.Errorf("user session required")
	}
	rows, e := database.Rows(s.db, ctx, `SELECT id,question,answer,evidence_json,created_at FROM ai_query_history WHERE tenant_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 50`, p.TenantID, *p.ActorID)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []Answer{}
	for rows.Next() {
		var item Answer
		var raw []byte
		if e = rows.Scan(&item.ID, &item.Question, &item.Answer, &raw, &item.CreatedAt); e != nil {
			return nil, e
		}
		_ = json.Unmarshal(raw, &item.Evidence)
		out = append(out, item)
	}
	return out, rows.Err()
}
