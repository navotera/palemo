package settings

import (
	"context"
	"fmt"
	"regexp"
	"strings"

	"github.com/google/uuid"
	"github.com/npms-platform/npms/internal/audit"
	"github.com/npms-platform/npms/internal/platform/database"
	"github.com/npms-platform/npms/internal/tenant"
	"gorm.io/gorm"
)

var fieldKeyPattern = regexp.MustCompile(`^[a-z][a-z0-9_]{0,39}$`)
var hexColorPattern = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

type Service struct {
	db         *gorm.DB
	repository *Repository
	audit      *audit.Service
}

func NewService(db *gorm.DB, repository *Repository) *Service {
	return &Service{db: db, repository: repository, audit: audit.NewService()}
}

func (s *Service) requireManager(ctx context.Context) (tenant.Principal, error) {
	p, err := tenant.PrincipalFrom(ctx)
	if err != nil || p.ActorID == nil {
		return tenant.Principal{}, fmt.Errorf("user session required")
	}
	role, err := s.repository.Role(ctx, p.TenantID, *p.ActorID)
	if err != nil || (role != "admin" && role != "manager") {
		return tenant.Principal{}, fmt.Errorf("admin or manager role required")
	}
	return p, nil
}

func (s *Service) ProjectTypes(ctx context.Context) ([]ProjectType, error) {
	p, err := tenant.PrincipalFrom(ctx)
	if err != nil {
		return nil, err
	}
	custom, err := s.repository.ProjectTypes(ctx, p.TenantID)
	if err != nil {
		return nil, err
	}
	return append([]ProjectType{
		{Name: "Operational", Value: "operational", Color: "#3b9a68", BuiltIn: true},
		{Name: "Technical", Value: "technical", Color: "#4774b8", BuiltIn: true},
		{Name: "R&D", Value: "rnd", Color: "#7c5dba", BuiltIn: true},
	}, custom...), nil
}

func (s *Service) CreateProjectType(ctx context.Context, q CreateProjectTypeRequest) (ProjectType, error) {
	p, err := s.requireManager(ctx)
	if err != nil {
		return ProjectType{}, err
	}
	q.Name, q.Color = strings.TrimSpace(q.Name), strings.TrimSpace(q.Color)
	if len([]rune(q.Name)) < 1 || len([]rune(q.Name)) > 40 {
		return ProjectType{}, fmt.Errorf("name must contain 1 to 40 characters")
	}
	for _, name := range []string{"operational", "technical", "r&d", "rnd"} {
		if strings.EqualFold(q.Name, name) {
			return ProjectType{}, fmt.Errorf("project type already exists")
		}
	}
	if q.Color == "" {
		q.Color = "#60766a"
	}
	if !hexColorPattern.MatchString(q.Color) {
		return ProjectType{}, fmt.Errorf("color must be a six-digit hex color")
	}
	tx, err := database.Begin(s.db, ctx)
	if err != nil {
		return ProjectType{}, err
	}
	defer database.Rollback(tx)
	item, err := s.repository.CreateProjectType(ctx, tx, p.TenantID, q)
	if err != nil {
		return ProjectType{}, fmt.Errorf("project type already exists")
	}
	if err = s.audit.Record(ctx, tx, audit.Event{TenantID: p.TenantID, ActorID: p.ActorID, ActorSource: p.Source, Action: "create", EntityType: "project_type", EntityID: *item.ID, After: item}); err != nil {
		return ProjectType{}, err
	}
	if err = database.Commit(tx); err != nil {
		return ProjectType{}, err
	}
	return item, nil
}

func (s *Service) MetadataFields(ctx context.Context) ([]MetadataField, error) {
	p, err := tenant.PrincipalFrom(ctx)
	if err != nil {
		return nil, err
	}
	return s.repository.MetadataFields(ctx, p.TenantID)
}

func (s *Service) CreateMetadataField(ctx context.Context, q CreateMetadataFieldRequest) (MetadataField, error) {
	p, err := s.requireManager(ctx)
	if err != nil {
		return MetadataField{}, err
	}
	q.Name, q.Key, q.Type = strings.TrimSpace(q.Name), strings.ToLower(strings.TrimSpace(q.Key)), strings.ToLower(strings.TrimSpace(q.Type))
	if q.Name == "" || len([]rune(q.Name)) > 60 {
		return MetadataField{}, fmt.Errorf("name is required and cannot exceed 60 characters")
	}
	if !fieldKeyPattern.MatchString(q.Key) {
		return MetadataField{}, fmt.Errorf("key must use lowercase letters, numbers, and underscores")
	}
	valid := map[string]bool{"text": true, "number": true, "date": true, "boolean": true, "select": true}
	if !valid[q.Type] {
		return MetadataField{}, fmt.Errorf("invalid metadata field type")
	}
	clean := []string{}
	seen := map[string]bool{}
	for _, option := range q.Options {
		option = strings.TrimSpace(option)
		key := strings.ToLower(option)
		if option != "" && !seen[key] {
			seen[key] = true
			clean = append(clean, option)
		}
	}
	q.Options = clean
	if q.Type == "select" && len(q.Options) == 0 {
		return MetadataField{}, fmt.Errorf("select fields require at least one option")
	}
	if q.Type != "select" {
		q.Options = []string{}
	}
	tx, err := database.Begin(s.db, ctx)
	if err != nil {
		return MetadataField{}, err
	}
	defer database.Rollback(tx)
	item, err := s.repository.CreateMetadataField(ctx, tx, p.TenantID, q)
	if err != nil {
		return MetadataField{}, fmt.Errorf("metadata key already exists")
	}
	if err = s.audit.Record(ctx, tx, audit.Event{TenantID: p.TenantID, ActorID: p.ActorID, ActorSource: p.Source, Action: "create", EntityType: "project_metadata_field", EntityID: item.ID, After: item}); err != nil {
		return MetadataField{}, err
	}
	if err = database.Commit(tx); err != nil {
		return MetadataField{}, err
	}
	return item, nil
}

func (s *Service) CreateUser(ctx context.Context, q CreateUserRequest) (DirectoryUser, error) {
	p, err := tenant.PrincipalFrom(ctx)
	if err != nil || p.ActorID == nil {
		return DirectoryUser{}, fmt.Errorf("user session required")
	}
	q.Name = strings.TrimSpace(q.Name)
	q.Email = strings.ToLower(strings.TrimSpace(q.Email))
	q.Role = strings.ToLower(strings.TrimSpace(q.Role))
	if q.Name == "" || q.Email == "" || !strings.Contains(q.Email, "@") || q.TeamID == uuid.Nil {
		return DirectoryUser{}, fmt.Errorf("name, valid email, and team_id are required")
	}
	roles := map[string]bool{"admin": true, "manager": true, "supervisor": true, "staff": true}
	if !roles[q.Role] {
		return DirectoryUser{}, fmt.Errorf("invalid role")
	}
	actorRole, roleErr := s.repository.Role(ctx, p.TenantID, *p.ActorID)
	leadAllowed, leadErr := s.repository.IsDivisionLeadForTeam(ctx, p.TenantID, *p.ActorID, q.TeamID)
	if roleErr != nil || leadErr != nil || (actorRole != "admin" && actorRole != "manager" && !leadAllowed) {
		return DirectoryUser{}, fmt.Errorf("admin, manager, or division lead role required")
	}
	tx, err := database.Begin(s.db, ctx)
	if err != nil {
		return DirectoryUser{}, err
	}
	defer database.Rollback(tx)
	exists, err := s.repository.TeamExists(ctx, tx, p.TenantID, q.TeamID)
	if err != nil {
		return DirectoryUser{}, err
	}
	if !exists {
		return DirectoryUser{}, fmt.Errorf("team not found")
	}
	item, err := s.repository.CreateUser(ctx, tx, p.TenantID, q)
	if err != nil {
		return DirectoryUser{}, fmt.Errorf("email already exists")
	}
	if err = s.audit.Record(ctx, tx, audit.Event{TenantID: p.TenantID, ActorID: p.ActorID, ActorSource: p.Source, Action: "create", EntityType: "user", EntityID: item.ID, After: item}); err != nil {
		return DirectoryUser{}, err
	}
	if err = database.Commit(tx); err != nil {
		return DirectoryUser{}, err
	}
	return item, nil
}
