package knowledge

import (
	"context"
	"fmt"
	"github.com/google/uuid"
	"github.com/npms-platform/npms/internal/platform/database"
	"github.com/npms-platform/npms/internal/tenant"
	"strings"
	"time"
)

type SearchResult struct {
	ID        uuid.UUID  `json:"id"`
	Type      string     `json:"type"`
	Title     string     `json:"title"`
	Excerpt   string     `json:"excerpt"`
	ProjectID *uuid.UUID `json:"project_id,omitempty"`
	UpdatedAt time.Time  `json:"updated_at"`
}

func (s *Service) Search(ctx context.Context, query, kind string) ([]SearchResult, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil {
		return nil, e
	}
	if strings.TrimSpace(query) == "" {
		return []SearchResult{}, nil
	}
	typeFilter := ""
	args := []any{p.TenantID, query}
	if kind != "" {
		valid := map[string]bool{"wiki": true, "meeting": true, "decision": true, "lesson": true}
		if !valid[kind] {
			return nil, fmt.Errorf("invalid search type")
		}
		args = append(args, kind)
		typeFilter = " WHERE kind=$3"
	}
	rows, e := database.Rows(s.db, ctx, `SELECT id,kind,title,ts_headline('simple',content,plainto_tsquery('simple',$2),'MaxWords=24'),project_id,updated_at FROM (SELECT id,'wiki' kind,title,content,NULL::uuid project_id,updated_at,tenant_id,deleted_at FROM wiki_pages UNION ALL SELECT id,'meeting',title,content,related_project_id,updated_at,tenant_id,deleted_at FROM meeting_notes UNION ALL SELECT id,'decision',title,content,related_project_id,updated_at,tenant_id,deleted_at FROM decision_logs UNION ALL SELECT id,'lesson',title,content,project_id,updated_at,tenant_id,deleted_at FROM lessons_learned) entries WHERE tenant_id=$1 AND deleted_at IS NULL AND to_tsvector('simple',title||' '||content)@@plainto_tsquery('simple',$2)`+func() string {
		if typeFilter != "" {
			return " AND kind=$3"
		}
		return ""
	}()+` ORDER BY updated_at DESC LIMIT 100`, args...)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []SearchResult{}
	for rows.Next() {
		var item SearchResult
		if e = rows.Scan(&item.ID, &item.Type, &item.Title, &item.Excerpt, &item.ProjectID, &item.UpdatedAt); e != nil {
			return nil, e
		}
		out = append(out, item)
	}
	return out, rows.Err()
}
