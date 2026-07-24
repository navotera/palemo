package projects

import (
	"encoding/json"
	"fmt"
	"github.com/google/uuid"
	"strings"
	"time"
)

type TextArray []string

func (values *TextArray) Scan(source any) error {
	if source == nil {
		*values = TextArray{}
		return nil
	}
	var raw string
	switch value := source.(type) {
	case string:
		raw = value
	case []byte:
		raw = string(value)
	default:
		return fmt.Errorf("unsupported text array type %T", source)
	}
	raw = strings.TrimPrefix(strings.TrimSuffix(strings.TrimSpace(raw), "}"), "{")
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

type Project struct {
	ID                        uuid.UUID       `json:"id"`
	TeamID                    uuid.UUID       `json:"team_id"`
	ParentProjectID           *uuid.UUID      `json:"parent_project_id,omitempty"`
	TemplateID                *uuid.UUID      `json:"template_id,omitempty"`
	Name                      string          `json:"name"`
	ProjectType               string          `json:"project_type"`
	Tags                      TextArray       `json:"tags"`
	PreliminaryNoteTemplateID *uuid.UUID      `json:"preliminary_note_template_id,omitempty"`
	PreliminaryNotes          string          `json:"preliminary_notes"`
	Status                    string          `json:"status"`
	Source                    *string         `json:"source,omitempty"`
	SourceRef                 *string         `json:"source_ref,omitempty"`
	Metadata                  json.RawMessage `json:"metadata"`
	CreatedAt                 time.Time       `json:"created_at"`
	UpdatedAt                 time.Time       `json:"updated_at"`
	DivisionIDs               []uuid.UUID     `json:"division_ids,omitempty"`
	KnowledgePageIDs          []uuid.UUID     `json:"knowledge_page_ids,omitempty"`
	MemberIDs                 []uuid.UUID     `json:"member_ids,omitempty"`
	ReviewerIDs               []uuid.UUID     `json:"reviewer_ids,omitempty"`
}
type CreateRequest struct {
	TeamID                    uuid.UUID       `json:"team_id"`
	ParentProjectID           *uuid.UUID      `json:"parent_project_id"`
	TemplateID                *uuid.UUID      `json:"template_id"`
	Name                      string          `json:"name"`
	ProjectType               string          `json:"project_type"`
	Tags                      []string        `json:"tags"`
	PreliminaryNoteTemplateID *uuid.UUID      `json:"preliminary_note_template_id"`
	PreliminaryNotes          string          `json:"preliminary_notes"`
	CustomChecklist           []string        `json:"custom_checklist"`
	Source                    *string         `json:"source"`
	SourceRef                 *string         `json:"source_ref"`
	Metadata                  json.RawMessage `json:"metadata"`
	DivisionIDs               []uuid.UUID     `json:"division_ids"`
	KnowledgePageIDs          []uuid.UUID     `json:"knowledge_page_ids"`
	MemberIDs                 []uuid.UUID     `json:"member_ids"`
	ReviewerIDs               []uuid.UUID     `json:"reviewer_ids"`
}

type PreliminaryNoteTemplate struct {
	ID              uuid.UUID `json:"id"`
	Name            string    `json:"name"`
	ContentMarkdown string    `json:"content_markdown"`
}
