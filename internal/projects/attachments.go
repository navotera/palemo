package projects

import (
	"context"
	"fmt"
	"github.com/npms-platform/npms/internal/platform/database"
	"time"

	"github.com/google/uuid"
	"github.com/npms-platform/npms/internal/audit"
	"github.com/npms-platform/npms/internal/tenant"
)

type FinishAttachment struct {
	ID          uuid.UUID `json:"id"`
	ProjectID   uuid.UUID `json:"project_id"`
	Filename    string    `json:"filename"`
	ContentType string    `json:"content_type"`
	SizeBytes   int64     `json:"size_bytes"`
	CreatedAt   time.Time `json:"created_at"`
}
type FinishAttachmentFile struct {
	FinishAttachment
	Content []byte
}

func (s *Service) ListFinishAttachments(ctx context.Context, projectID uuid.UUID) ([]FinishAttachment, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil {
		return nil, e
	}
	rows, e := database.Rows(s.db, ctx, `SELECT id,project_id,filename,content_type,size_bytes,created_at FROM project_finish_attachments WHERE tenant_id=$1 AND project_id=$2 ORDER BY created_at DESC`, p.TenantID, projectID)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []FinishAttachment{}
	for rows.Next() {
		var item FinishAttachment
		if e = rows.Scan(&item.ID, &item.ProjectID, &item.Filename, &item.ContentType, &item.SizeBytes, &item.CreatedAt); e != nil {
			return nil, e
		}
		out = append(out, item)
	}
	return out, rows.Err()
}
func (s *Service) AddFinishAttachment(ctx context.Context, projectID uuid.UUID, filename, contentType string, content []byte) (FinishAttachment, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil {
		return FinishAttachment{}, e
	}
	tx, e := database.Begin(s.db, ctx)
	if e != nil {
		return FinishAttachment{}, e
	}
	defer database.Rollback(tx)
	var item FinishAttachment
	e = database.Row(tx, ctx, `INSERT INTO project_finish_attachments(tenant_id,project_id,filename,content_type,size_bytes,content,uploaded_by) SELECT $1,id,$3,$4,$5,$6,$7 FROM projects WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL RETURNING id,project_id,filename,content_type,size_bytes,created_at`, p.TenantID, projectID, filename, contentType, len(content), content, p.ActorID).Scan(&item.ID, &item.ProjectID, &item.Filename, &item.ContentType, &item.SizeBytes, &item.CreatedAt)
	if database.IsNotFound(e) {
		return FinishAttachment{}, fmt.Errorf("project not found")
	}
	if e != nil {
		return FinishAttachment{}, e
	}
	if e = s.audit.Record(ctx, tx, audit.Event{TenantID: p.TenantID, ActorID: p.ActorID, ActorSource: p.Source, Action: "attach_finish_proof", EntityType: "project", EntityID: projectID, After: item}); e != nil {
		return FinishAttachment{}, e
	}
	if e = database.Commit(tx); e != nil {
		return FinishAttachment{}, e
	}
	return item, nil
}
func (s *Service) GetFinishAttachment(ctx context.Context, projectID, attachmentID uuid.UUID) (FinishAttachmentFile, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil {
		return FinishAttachmentFile{}, e
	}
	var item FinishAttachmentFile
	e = database.Row(s.db, ctx, `SELECT id,project_id,filename,content_type,size_bytes,created_at,content FROM project_finish_attachments WHERE tenant_id=$1 AND project_id=$2 AND id=$3`, p.TenantID, projectID, attachmentID).Scan(&item.ID, &item.ProjectID, &item.Filename, &item.ContentType, &item.SizeBytes, &item.CreatedAt, &item.Content)
	return item, e
}
