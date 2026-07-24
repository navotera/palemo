package projects

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
	"unicode"
	"unicode/utf8"
)

type Service struct {
	db         *gorm.DB
	repository *Repository
	audit      *audit.Service
}

func NewService(db *gorm.DB, r *Repository) *Service {
	return &Service{db: db, repository: r, audit: audit.NewService()}
}
func (s *Service) List(ctx context.Context) ([]Project, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil {
		return nil, e
	}
	return s.repository.List(ctx, p.TenantID)
}
func (s *Service) Create(ctx context.Context, q CreateRequest) (Project, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil {
		return Project{}, e
	}
	if strings.TrimSpace(q.Name) == "" || q.TeamID == uuid.Nil {
		return Project{}, fmt.Errorf("name and team_id are required")
	}
	q.ProjectType = strings.TrimSpace(q.ProjectType)
	if q.ProjectType == "" {
		q.ProjectType = "operational"
	}
	for _, builtIn := range []string{"operational", "technical", "rnd"} {
		if strings.EqualFold(q.ProjectType, builtIn) {
			q.ProjectType = builtIn
		}
	}
	if utf8.RuneCountInString(q.ProjectType) > 40 || strings.IndexFunc(q.ProjectType, unicode.IsControl) >= 0 {
		return Project{}, fmt.Errorf("project_type must be a printable label of at most 40 characters")
	}
	q.Tags, e = normalizeTags(q.Tags)
	if e != nil {
		return Project{}, e
	}
	if utf8.RuneCountInString(q.PreliminaryNotes) > 50000 {
		return Project{}, fmt.Errorf("preliminary_notes cannot exceed 50000 characters")
	}
	q.CustomChecklist = normalizeChecklist(q.CustomChecklist)
	if q.TemplateID != nil && len(q.CustomChecklist) > 0 {
		return Project{}, fmt.Errorf("template_id and custom_checklist cannot be used together")
	}
	if q.Source != nil && q.SourceRef != nil && strings.TrimSpace(*q.Source) != "" && strings.TrimSpace(*q.SourceRef) != "" {
		existing, ok, e := s.repository.BySource(ctx, p.TenantID, *q.Source, *q.SourceRef)
		if e != nil {
			return Project{}, e
		}
		if ok {
			return existing, nil
		}
	}
	tx, e := database.Begin(s.db, ctx)
	if e != nil {
		return Project{}, e
	}
	defer database.Rollback(tx)
	if q.PreliminaryNoteTemplateID != nil {
		var exists bool
		if e = database.Row(tx, ctx, `SELECT EXISTS(SELECT 1 FROM preliminary_note_templates WHERE tenant_id=$1 AND id=$2)`, p.TenantID, *q.PreliminaryNoteTemplateID).Scan(&exists); e != nil || !exists {
			return Project{}, fmt.Errorf("preliminary note template not found")
		}
	}
	divisionIDs, knowledgeIDs, e := s.validateLinks(ctx, tx, p.TenantID, q)
	if e != nil {
		return Project{}, e
	}
	project, e := s.repository.Create(ctx, tx, p.TenantID, q)
	if e != nil {
		return Project{}, e
	}
	if q.TemplateID != nil {
		if e = s.cloneTemplate(ctx, tx, p.TenantID, project.ID, *q.TemplateID); e != nil {
			return Project{}, e
		}
	}
	if len(q.CustomChecklist) > 0 {
		if e = s.createCustomChecklist(ctx, tx, p.TenantID, project.ID, q.CustomChecklist); e != nil {
			return Project{}, e
		}
	}
	for _, divisionID := range divisionIDs {
		if _, e = database.Exec(tx, ctx, `INSERT INTO project_divisions(tenant_id,project_id,division_id) VALUES($1,$2,$3)`, p.TenantID, project.ID, divisionID); e != nil {
			return Project{}, e
		}
	}
	for _, pageID := range knowledgeIDs {
		if _, e = database.Exec(tx, ctx, `INSERT INTO project_knowledge_links(tenant_id,project_id,wiki_page_id) VALUES($1,$2,$3)`, p.TenantID, project.ID, pageID); e != nil {
			return Project{}, e
		}
	}
	project.DivisionIDs, project.KnowledgePageIDs = divisionIDs, knowledgeIDs
	memberIDs, e := s.validatePeople(ctx, tx, p.TenantID, q.MemberIDs)
	if e != nil {
		return Project{}, e
	}
	reviewerIDs, e := s.validatePeople(ctx, tx, p.TenantID, q.ReviewerIDs)
	if e != nil {
		return Project{}, e
	}
	for _, userID := range memberIDs {
		if _, e = database.Exec(tx, ctx, `INSERT INTO project_people(tenant_id,project_id,user_id,project_role) VALUES($1,$2,$3,'member')`, p.TenantID, project.ID, userID); e != nil {
			return Project{}, e
		}
	}
	for _, userID := range reviewerIDs {
		if _, e = database.Exec(tx, ctx, `INSERT INTO project_people(tenant_id,project_id,user_id,project_role) VALUES($1,$2,$3,'reviewer')`, p.TenantID, project.ID, userID); e != nil {
			return Project{}, e
		}
	}
	project.MemberIDs, project.ReviewerIDs = memberIDs, reviewerIDs
	if e = s.audit.Record(ctx, tx, audit.Event{TenantID: p.TenantID, ActorID: p.ActorID, ActorSource: p.Source, Action: "create", EntityType: "project", EntityID: project.ID, After: project}); e != nil {
		return Project{}, e
	}
	if e = database.Commit(tx); e != nil {
		return Project{}, e
	}
	return project, nil
}

func (s *Service) PreliminaryNoteTemplates(ctx context.Context) ([]PreliminaryNoteTemplate, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil {
		return nil, e
	}
	rows, e := database.Rows(s.db, ctx, `SELECT id,name,content_markdown FROM preliminary_note_templates WHERE tenant_id=$1 ORDER BY name`, p.TenantID)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []PreliminaryNoteTemplate{}
	for rows.Next() {
		var item PreliminaryNoteTemplate
		if e = rows.Scan(&item.ID, &item.Name, &item.ContentMarkdown); e != nil {
			return nil, e
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func normalizeChecklist(items []string) []string {
	out := make([]string, 0, len(items))
	for _, item := range items {
		if label := strings.TrimSpace(item); label != "" {
			out = append(out, label)
		}
	}
	return out
}

func normalizeTags(tags []string) ([]string, error) {
	if len(tags) > 20 {
		return nil, fmt.Errorf("tags cannot contain more than 20 items")
	}
	seen := map[string]bool{}
	out := make([]string, 0, len(tags))
	for _, raw := range tags {
		tag := strings.TrimSpace(raw)
		if tag == "" {
			continue
		}
		if utf8.RuneCountInString(tag) > 32 || strings.IndexFunc(tag, unicode.IsControl) >= 0 {
			return nil, fmt.Errorf("each tag must be a printable label of at most 32 characters")
		}
		key := strings.ToLower(tag)
		if !seen[key] {
			seen[key] = true
			out = append(out, tag)
		}
	}
	return out, nil
}

func (s *Service) createCustomChecklist(ctx context.Context, tx *gorm.DB, tenantID, projectID uuid.UUID, items []string) error {
	var taskID uuid.UUID
	if e := database.Row(tx, ctx, `INSERT INTO tasks(tenant_id,project_id,title,board_column,position) VALUES($1,$2,'Project checklist','todo',0) RETURNING id`, tenantID, projectID).Scan(&taskID); e != nil {
		return e
	}
	for index, label := range items {
		if _, e := database.Exec(tx, ctx, `INSERT INTO checklist_items(tenant_id,task_id,label,item_order) VALUES($1,$2,$3,$4)`, tenantID, taskID, label, index); e != nil {
			return e
		}
	}
	return nil
}

func (s *Service) validateLinks(ctx context.Context, tx *gorm.DB, tenantID uuid.UUID, q CreateRequest) ([]uuid.UUID, []uuid.UUID, error) {
	var primaryDivision uuid.UUID
	if e := database.Row(tx, ctx, `SELECT division_id FROM teams WHERE tenant_id=$1 AND id=$2`, tenantID, q.TeamID).Scan(&primaryDivision); e != nil {
		return nil, nil, fmt.Errorf("responsible team not found")
	}
	divisionIDs := []uuid.UUID{primaryDivision}
	for _, memberID := range uniqueIDs(q.MemberIDs) {
		var divisionID uuid.UUID
		e := database.Row(tx, ctx, `SELECT t.division_id FROM users u JOIN teams t ON t.tenant_id=u.tenant_id AND t.id=u.team_id WHERE u.tenant_id=$1 AND u.id=$2`, tenantID, memberID).Scan(&divisionID)
		if e == nil {
			divisionIDs = append(divisionIDs, divisionID)
		} else if !database.IsNotFound(e) {
			return nil, nil, e
		}
	}
	divisionIDs = uniqueIDs(divisionIDs)
	for _, id := range divisionIDs {
		var exists bool
		if e := database.Row(tx, ctx, `SELECT EXISTS(SELECT 1 FROM divisions WHERE tenant_id=$1 AND id=$2)`, tenantID, id).Scan(&exists); e != nil || !exists {
			return nil, nil, fmt.Errorf("division not found")
		}
	}
	knowledgeIDs := uniqueIDs(q.KnowledgePageIDs)
	for _, id := range knowledgeIDs {
		var exists bool
		if e := database.Row(tx, ctx, `SELECT EXISTS(SELECT 1 FROM wiki_pages WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL)`, tenantID, id).Scan(&exists); e != nil || !exists {
			return nil, nil, fmt.Errorf("knowledge page not found")
		}
	}
	return divisionIDs, knowledgeIDs, nil
}
func (s *Service) validatePeople(ctx context.Context, tx *gorm.DB, tenantID uuid.UUID, ids []uuid.UUID) ([]uuid.UUID, error) {
	out := uniqueIDs(ids)
	for _, id := range out {
		var exists bool
		if e := database.Row(tx, ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE tenant_id=$1 AND id=$2)`, tenantID, id).Scan(&exists); e != nil || !exists {
			return nil, fmt.Errorf("project user not found")
		}
	}
	return out, nil
}
func uniqueIDs(ids []uuid.UUID) []uuid.UUID {
	seen := map[uuid.UUID]bool{}
	out := make([]uuid.UUID, 0, len(ids))
	for _, id := range ids {
		if id != uuid.Nil && !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	return out
}

type templateStructure struct {
	Tasks []struct {
		Title       string `json:"title"`
		BoardColumn string `json:"board_column"`
		Position    int    `json:"position"`
		Checklist   []struct {
			Label string `json:"label"`
		} `json:"checklist"`
	} `json:"tasks"`
}

func (s *Service) cloneTemplate(ctx context.Context, tx *gorm.DB, tenantID, projectID, templateID uuid.UUID) error {
	var raw []byte
	if e := database.Row(tx, ctx, `SELECT structure_json FROM project_templates WHERE tenant_id=$1 AND id=$2`, tenantID, templateID).Scan(&raw); e != nil {
		if database.IsNotFound(e) {
			return fmt.Errorf("template not found")
		}
		return e
	}
	var structure templateStructure
	if e := json.Unmarshal(raw, &structure); e != nil {
		return fmt.Errorf("invalid template structure: %w", e)
	}
	for i, t := range structure.Tasks {
		column := t.BoardColumn
		if column == "" {
			column = "todo"
		}
		position := t.Position
		if position < 0 {
			position = i
		}
		var taskID uuid.UUID
		if e := database.Row(tx, ctx, `INSERT INTO tasks(tenant_id,project_id,title,board_column,position) VALUES($1,$2,$3,$4,$5) RETURNING id`, tenantID, projectID, t.Title, column, position).Scan(&taskID); e != nil {
			return e
		}
		for j, item := range t.Checklist {
			if strings.TrimSpace(item.Label) == "" {
				continue
			}
			if _, e := database.Exec(tx, ctx, `INSERT INTO checklist_items(tenant_id,task_id,label,item_order) VALUES($1,$2,$3,$4)`, tenantID, taskID, item.Label, j); e != nil {
				return e
			}
		}
	}
	return nil
}
