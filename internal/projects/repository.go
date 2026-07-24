package projects

import (
	"context"
	"fmt"
	"github.com/google/uuid"
	"github.com/npms-platform/npms/internal/platform/database"
	"gorm.io/gorm"
)

type Repository struct{ db *gorm.DB }

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }
func (r *Repository) List(ctx context.Context, tenantID uuid.UUID) ([]Project, error) {
	rows, err := database.Rows(r.db, ctx, `SELECT id,team_id,parent_project_id,template_id,name,project_type,tags,preliminary_note_template_id,preliminary_notes,status,source,source_ref,metadata,created_at,updated_at FROM projects WHERE tenant_id=$1 AND deleted_at IS NULL ORDER BY updated_at DESC`, tenantID)
	if err != nil {
		return nil, fmt.Errorf("list projects: %w", err)
	}
	defer rows.Close()
	out := []Project{}
	for rows.Next() {
		var p Project
		if err = rows.Scan(&p.ID, &p.TeamID, &p.ParentProjectID, &p.TemplateID, &p.Name, &p.ProjectType, &p.Tags, &p.PreliminaryNoteTemplateID, &p.PreliminaryNotes, &p.Status, &p.Source, &p.SourceRef, &p.Metadata, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan project: %w", err)
		}
		out = append(out, p)
	}
	return out, rows.Err()
}
func (r *Repository) BySource(ctx context.Context, tenantID uuid.UUID, source, ref string) (Project, bool, error) {
	var p Project
	err := database.Row(r.db, ctx, `SELECT id,team_id,parent_project_id,template_id,name,project_type,tags,preliminary_note_template_id,preliminary_notes,status,source,source_ref,metadata,created_at,updated_at FROM projects WHERE tenant_id=$1 AND source=$2 AND source_ref=$3 AND deleted_at IS NULL`, tenantID, source, ref).Scan(&p.ID, &p.TeamID, &p.ParentProjectID, &p.TemplateID, &p.Name, &p.ProjectType, &p.Tags, &p.PreliminaryNoteTemplateID, &p.PreliminaryNotes, &p.Status, &p.Source, &p.SourceRef, &p.Metadata, &p.CreatedAt, &p.UpdatedAt)
	if database.IsNotFound(err) {
		return Project{}, false, nil
	}
	return p, err == nil, err
}
func (r *Repository) Create(ctx context.Context, tx *gorm.DB, tenantID uuid.UUID, q CreateRequest) (Project, error) {
	metadata := q.Metadata
	if len(metadata) == 0 {
		metadata = []byte(`{}`)
	}
	var p Project
	err := database.Row(tx, ctx, `INSERT INTO projects(tenant_id,team_id,parent_project_id,template_id,name,project_type,tags,preliminary_note_template_id,preliminary_notes,source,source_ref,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id,team_id,parent_project_id,template_id,name,project_type,tags,preliminary_note_template_id,preliminary_notes,status,source,source_ref,metadata,created_at,updated_at`, tenantID, q.TeamID, q.ParentProjectID, q.TemplateID, q.Name, q.ProjectType, q.Tags, q.PreliminaryNoteTemplateID, q.PreliminaryNotes, q.Source, q.SourceRef, metadata).Scan(&p.ID, &p.TeamID, &p.ParentProjectID, &p.TemplateID, &p.Name, &p.ProjectType, &p.Tags, &p.PreliminaryNoteTemplateID, &p.PreliminaryNotes, &p.Status, &p.Source, &p.SourceRef, &p.Metadata, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return Project{}, fmt.Errorf("create project: %w", err)
	}
	return p, nil
}
