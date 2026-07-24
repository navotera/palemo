package knowledge

import (
	"context"
	"fmt"
	"github.com/npms-platform/npms/internal/platform/database"
	"gorm.io/gorm"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/npms-platform/npms/internal/audit"
	"github.com/npms-platform/npms/internal/tenant"
)

type TextArray []string

func (values *TextArray) Scan(source any) error {
	if source == nil {
		*values = TextArray{}
		return nil
	}
	raw := fmt.Sprint(source)
	raw = strings.TrimPrefix(strings.TrimSuffix(raw, "}"), "{")
	if raw == "" {
		*values = TextArray{}
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make(TextArray, 0, len(parts))
	for _, part := range parts {
		out = append(out, strings.Trim(strings.TrimSpace(part), `"`))
	}
	*values = out
	return nil
}

type Workspace struct {
	ID          uuid.UUID  `json:"id"`
	TeamID      *uuid.UUID `json:"team_id"`
	Name        string     `json:"name"`
	Description *string    `json:"description"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}
type Document struct {
	ID          uuid.UUID  `json:"id"`
	WorkspaceID uuid.UUID  `json:"workspace_id"`
	ParentID    *uuid.UUID `json:"parent_page_id,omitempty"`
	TeamID      *uuid.UUID `json:"team_id"`
	Title       string     `json:"title"`
	Content     string     `json:"content"`
	AuthorID    uuid.UUID  `json:"author_id"`
	Tags        TextArray  `json:"tags"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}
type CreateRequest struct {
	WorkspaceID uuid.UUID  `json:"workspace_id"`
	ParentID    *uuid.UUID `json:"parent_page_id"`
	TeamID      *uuid.UUID `json:"team_id"`
	Title       string     `json:"title"`
	Content     string     `json:"content"`
	Tags        []string   `json:"tags"`
}
type UpdateRequest struct {
	Title    *string    `json:"title"`
	Content  *string    `json:"content"`
	Tags     *[]string  `json:"tags"`
	ParentID *uuid.UUID `json:"parent_page_id"`
}
type Service struct {
	db    *gorm.DB
	audit *audit.Service
}

func NewService(db *gorm.DB) *Service { return &Service{db: db, audit: audit.NewService()} }
func table(kind string) (string, bool) {
	switch kind {
	case "wiki":
		return "wiki_pages", true
	case "meetings":
		return "meeting_notes", true
	case "decisions":
		return "decision_logs", true
	case "lessons":
		return "lessons_learned", true
	}
	return "", false
}
func parentColumn(kind string) string {
	if kind == "wiki" {
		return "parent_page_id"
	}
	return "NULL::uuid"
}
func (s *Service) Workspaces(ctx context.Context) ([]Workspace, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil {
		return nil, e
	}
	rows, e := database.Rows(s.db, ctx, `SELECT id,team_id,name,description,created_at,updated_at FROM knowledge_workspaces WHERE tenant_id=$1 ORDER BY name`, p.TenantID)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []Workspace{}
	for rows.Next() {
		var item Workspace
		if e = rows.Scan(&item.ID, &item.TeamID, &item.Name, &item.Description, &item.CreatedAt, &item.UpdatedAt); e != nil {
			return nil, e
		}
		out = append(out, item)
	}
	return out, rows.Err()
}
func (s *Service) CreateWorkspace(ctx context.Context, name string, teamID *uuid.UUID, description *string) (Workspace, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil {
		return Workspace{}, e
	}
	if strings.TrimSpace(name) == "" {
		return Workspace{}, fmt.Errorf("name required")
	}
	tx, e := database.Begin(s.db, ctx)
	if e != nil {
		return Workspace{}, e
	}
	defer database.Rollback(tx)
	var item Workspace
	e = database.Row(tx, ctx, `INSERT INTO knowledge_workspaces(tenant_id,team_id,name,description) VALUES($1,$2,$3,$4) RETURNING id,team_id,name,description,created_at,updated_at`, p.TenantID, teamID, name, description).Scan(&item.ID, &item.TeamID, &item.Name, &item.Description, &item.CreatedAt, &item.UpdatedAt)
	if e != nil {
		return Workspace{}, e
	}
	if e = s.audit.Record(ctx, tx, audit.Event{TenantID: p.TenantID, ActorID: p.ActorID, ActorSource: p.Source, Action: "create", EntityType: "knowledge_workspace", EntityID: item.ID, After: item}); e != nil {
		return Workspace{}, e
	}
	if e = database.Commit(tx); e != nil {
		return Workspace{}, e
	}
	return item, nil
}
func (s *Service) List(ctx context.Context, kind, search string) ([]Document, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil {
		return nil, e
	}
	name, ok := table(kind)
	if !ok {
		return nil, fmt.Errorf("unsupported knowledge type")
	}
	query := fmt.Sprintf(`SELECT id,workspace_id,%s,team_id,title,content,author_id,tags,created_at,updated_at FROM %s WHERE tenant_id=$1 AND deleted_at IS NULL`, parentColumn(kind), name)
	args := []any{p.TenantID}
	if strings.TrimSpace(search) != "" {
		args = append(args, search)
		query += fmt.Sprintf(" AND to_tsvector('simple',title||' '||content) @@ plainto_tsquery('simple',$%d)", len(args))
	}
	query += " ORDER BY updated_at DESC"
	rows, e := database.Rows(s.db, ctx, query, args...)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []Document{}
	for rows.Next() {
		var item Document
		if e = rows.Scan(&item.ID, &item.WorkspaceID, &item.ParentID, &item.TeamID, &item.Title, &item.Content, &item.AuthorID, &item.Tags, &item.CreatedAt, &item.UpdatedAt); e != nil {
			return nil, e
		}
		out = append(out, item)
	}
	return out, rows.Err()
}
func (s *Service) Create(ctx context.Context, kind string, request CreateRequest) (Document, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil || p.ActorID == nil {
		return Document{}, fmt.Errorf("user session required")
	}
	name, ok := table(kind)
	if !ok {
		return Document{}, fmt.Errorf("unsupported knowledge type")
	}
	if request.WorkspaceID == uuid.Nil || strings.TrimSpace(request.Title) == "" {
		return Document{}, fmt.Errorf("workspace_id and title required")
	}
	parentField := ""
	parentValue := any(nil)
	if kind == "wiki" {
		parentField = ",parent_page_id"
		parentValue = request.ParentID
	}
	query := fmt.Sprintf(`INSERT INTO %s(tenant_id,workspace_id,team_id,title,content,author_id,tags%s) SELECT $1,$2,$3,$4,$5,$6,$7%s WHERE EXISTS(SELECT 1 FROM knowledge_workspaces WHERE tenant_id=$1 AND id=$2) RETURNING id,workspace_id,%s,team_id,title,content,author_id,tags,created_at,updated_at`, name, parentField, func() string {
		if kind == "wiki" {
			return ",$8"
		}
		return ""
	}(), parentColumn(kind))
	args := []any{p.TenantID, request.WorkspaceID, request.TeamID, request.Title, request.Content, *p.ActorID, request.Tags}
	if kind == "wiki" {
		args = append(args, parentValue)
	}
	tx, e := database.Begin(s.db, ctx)
	if e != nil {
		return Document{}, e
	}
	defer database.Rollback(tx)
	var item Document
	e = database.Row(tx, ctx, query, args...).Scan(&item.ID, &item.WorkspaceID, &item.ParentID, &item.TeamID, &item.Title, &item.Content, &item.AuthorID, &item.Tags, &item.CreatedAt, &item.UpdatedAt)
	if e != nil {
		return Document{}, e
	}
	if e = s.audit.Record(ctx, tx, audit.Event{TenantID: p.TenantID, ActorID: p.ActorID, ActorSource: p.Source, Action: "create", EntityType: "knowledge_" + kind, EntityID: item.ID, After: item}); e != nil {
		return Document{}, e
	}
	if e = database.Commit(tx); e != nil {
		return Document{}, e
	}
	return item, nil
}
func (s *Service) Update(ctx context.Context, kind string, id uuid.UUID, request UpdateRequest) (Document, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil {
		return Document{}, e
	}
	name, ok := table(kind)
	if !ok {
		return Document{}, fmt.Errorf("unsupported knowledge type")
	}
	tx, e := database.Begin(s.db, ctx)
	if e != nil {
		return Document{}, e
	}
	defer database.Rollback(tx)
	selectQuery := fmt.Sprintf(`SELECT id,workspace_id,%s,team_id,title,content,author_id,tags,created_at,updated_at FROM %s WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL FOR UPDATE`, parentColumn(kind), name)
	scan := func(row database.RowScanner, item *Document) error {
		return row.Scan(&item.ID, &item.WorkspaceID, &item.ParentID, &item.TeamID, &item.Title, &item.Content, &item.AuthorID, &item.Tags, &item.CreatedAt, &item.UpdatedAt)
	}
	var before, after Document
	if e = scan(database.Row(tx, ctx, selectQuery, p.TenantID, id), &before); e != nil {
		return Document{}, e
	}
	after = before
	if request.Title != nil {
		after.Title = *request.Title
	}
	if request.Content != nil {
		after.Content = *request.Content
	}
	if request.Tags != nil {
		after.Tags = TextArray(*request.Tags)
	}
	if kind == "wiki" && request.ParentID != nil {
		after.ParentID = request.ParentID
	}
	parentSet := ""
	args := []any{p.TenantID, id, after.Title, after.Content, []string(after.Tags)}
	if kind == "wiki" {
		parentSet = ",parent_page_id=$6"
		args = append(args, after.ParentID)
	}
	updateQuery := fmt.Sprintf(`UPDATE %s SET title=$3,content=$4,tags=$5%s,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,workspace_id,%s,team_id,title,content,author_id,tags,created_at,updated_at`, name, parentSet, parentColumn(kind))
	if e = scan(database.Row(tx, ctx, updateQuery, args...), &after); e != nil {
		return Document{}, e
	}
	if e = s.audit.Record(ctx, tx, audit.Event{TenantID: p.TenantID, ActorID: p.ActorID, ActorSource: p.Source, Action: "update", EntityType: "knowledge_" + kind, EntityID: id, Before: before, After: after}); e != nil {
		return Document{}, e
	}
	if e = database.Commit(tx); e != nil {
		return Document{}, e
	}
	return after, nil
}
