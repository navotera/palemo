package githubintegration

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"github.com/npms-platform/npms/internal/platform/database"
	"gorm.io/gorm"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/npms-platform/npms/internal/audit"
	"github.com/npms-platform/npms/internal/tenant"
)

type Link struct {
	ID         uuid.UUID `json:"id"`
	ProjectID  uuid.UUID `json:"project_id"`
	Repository string    `json:"repository"`
	CreatedAt  time.Time `json:"created_at"`
}
type CreateRequest struct {
	ProjectID     uuid.UUID `json:"project_id"`
	Repository    string    `json:"repo"`
	WebhookSecret string    `json:"webhook_secret"`
}
type Service struct {
	db    *gorm.DB
	audit *audit.Service
}

func NewService(db *gorm.DB) *Service   { return &Service{db: db, audit: audit.NewService()} }
func normalizeRepo(value string) string { return strings.ToLower(strings.TrimSpace(value)) }
func (s *Service) List(ctx context.Context) ([]Link, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil {
		return nil, e
	}
	rows, e := database.Rows(s.db, ctx, `SELECT id,project_id,repository,created_at FROM github_project_links WHERE tenant_id=$1 ORDER BY created_at DESC`, p.TenantID)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []Link{}
	for rows.Next() {
		var item Link
		if e = rows.Scan(&item.ID, &item.ProjectID, &item.Repository, &item.CreatedAt); e != nil {
			return nil, e
		}
		out = append(out, item)
	}
	return out, rows.Err()
}
func (s *Service) Link(ctx context.Context, request CreateRequest) (Link, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil {
		return Link{}, e
	}
	request.Repository = normalizeRepo(request.Repository)
	if request.ProjectID == uuid.Nil || !strings.Contains(request.Repository, "/") || len(request.WebhookSecret) < 16 {
		return Link{}, fmt.Errorf("project_id, org/repo, and a 16 character webhook_secret required")
	}
	tx, e := database.Begin(s.db, ctx)
	if e != nil {
		return Link{}, e
	}
	defer database.Rollback(tx)
	var item Link
	e = database.Row(tx, ctx, `INSERT INTO github_project_links(tenant_id,project_id,repository,webhook_secret) SELECT $1,$2,$3,$4 WHERE EXISTS(SELECT 1 FROM projects WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL) RETURNING id,project_id,repository,created_at`, p.TenantID, request.ProjectID, request.Repository, request.WebhookSecret).Scan(&item.ID, &item.ProjectID, &item.Repository, &item.CreatedAt)
	if e != nil {
		return Link{}, e
	}
	if e = s.audit.Record(ctx, tx, audit.Event{TenantID: p.TenantID, ActorID: p.ActorID, ActorSource: p.Source, Action: "create", EntityType: "github_project_link", EntityID: item.ID, After: item}); e != nil {
		return Link{}, e
	}
	if e = database.Commit(tx); e != nil {
		return Link{}, e
	}
	return item, nil
}

type webhookPayload struct {
	Repository struct {
		FullName string `json:"full_name"`
	} `json:"repository"`
	Commits []struct {
		Message string `json:"message"`
	} `json:"commits"`
	PullRequest *struct {
		Body   string `json:"body"`
		Merged bool   `json:"merged"`
		State  string `json:"state"`
	} `json:"pull_request"`
}

var taskReference = regexp.MustCompile(`(?i)NPMS_TASK[:=]([0-9a-f-]{36})`)

func verify(secret string, payload []byte, signature string) bool {
	if !strings.HasPrefix(signature, "sha256=") {
		return false
	}
	decoded, e := hex.DecodeString(strings.TrimPrefix(signature, "sha256="))
	if e != nil {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	return hmac.Equal(decoded, mac.Sum(nil))
}
func (s *Service) Ingest(ctx context.Context, event, delivery, signature string, raw []byte) (int, error) {
	if delivery == "" || event == "" {
		return 0, fmt.Errorf("event and delivery headers required")
	}
	var payload webhookPayload
	if json.Unmarshal(raw, &payload) != nil {
		return 0, fmt.Errorf("invalid payload")
	}
	repo := normalizeRepo(payload.Repository.FullName)
	var linkID, tenantID, projectID uuid.UUID
	var secret string
	e := database.Row(s.db, ctx, `SELECT id,tenant_id,project_id,webhook_secret FROM github_project_links WHERE repository=$1`, repo).Scan(&linkID, &tenantID, &projectID, &secret)
	if e != nil {
		return 0, fmt.Errorf("repository not linked")
	}
	if !verify(secret, raw, signature) {
		return 0, fmt.Errorf("invalid signature")
	}
	tx, e := database.Begin(s.db, ctx)
	if e != nil {
		return 0, e
	}
	defer database.Rollback(tx)
	result, e := database.Exec(tx, ctx, `INSERT INTO github_webhook_events(tenant_id,link_id,delivery_id,event_type,payload_json) VALUES($1,$2,$3,$4,$5) ON CONFLICT(link_id,delivery_id) DO NOTHING`, tenantID, linkID, delivery, event, raw)
	if e != nil {
		return 0, e
	}
	affected, _ := result.RowsAffected()
	if affected == 0 {
		return 0, database.Commit(tx)
	}
	texts := []string{}
	for _, commit := range payload.Commits {
		texts = append(texts, commit.Message)
	}
	column := "in_progress"
	if payload.PullRequest != nil {
		texts = append(texts, payload.PullRequest.Body)
		column = "review"
		if payload.PullRequest.Merged {
			column = "done"
		}
	}
	ids := map[uuid.UUID]struct{}{}
	for _, text := range texts {
		for _, match := range taskReference.FindAllStringSubmatch(text, -1) {
			if id, e := uuid.Parse(match[1]); e == nil {
				ids[id] = struct{}{}
			}
		}
	}
	updated := 0
	for id := range ids {
		var before, after map[string]any
		var title, oldColumn string
		e = database.Row(tx, ctx, `SELECT title,board_column FROM tasks WHERE tenant_id=$1 AND project_id=$2 AND id=$3 AND deleted_at IS NULL FOR UPDATE`, tenantID, projectID, id).Scan(&title, &oldColumn)
		if database.IsNotFound(e) {
			continue
		}
		if e != nil {
			return 0, e
		}
		before = map[string]any{"id": id, "title": title, "board_column": oldColumn}
		if _, e = database.Exec(tx, ctx, `UPDATE tasks SET board_column=$4,updated_at=now() WHERE tenant_id=$1 AND project_id=$2 AND id=$3`, tenantID, projectID, id, column); e != nil {
			return 0, e
		}
		after = map[string]any{"id": id, "title": title, "board_column": column}
		if e = s.audit.Record(ctx, tx, audit.Event{TenantID: tenantID, ActorSource: "api:github", Action: "status_change", EntityType: "task", EntityID: id, Before: before, After: after}); e != nil {
			return 0, e
		}
		updated++
	}
	if e = database.Commit(tx); e != nil {
		return 0, e
	}
	return updated, nil
}
