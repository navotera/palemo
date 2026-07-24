package settings

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
	"github.com/npms-platform/npms/internal/platform/database"
	"gorm.io/gorm"
)

type Repository struct{ db *gorm.DB }

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

func (r *Repository) Role(ctx context.Context, tenantID, userID uuid.UUID) (string, error) {
	var role string
	err := database.Row(r.db, ctx, `SELECT role FROM users WHERE tenant_id=$1 AND id=$2`, tenantID, userID).Scan(&role)
	return role, err
}

func (r *Repository) ProjectTypes(ctx context.Context, tenantID uuid.UUID) ([]ProjectType, error) {
	rows, err := database.Rows(r.db, ctx, `SELECT id,name,color FROM project_types WHERE tenant_id=$1 ORDER BY name`, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []ProjectType{}
	for rows.Next() {
		var item ProjectType
		var id uuid.UUID
		if err = rows.Scan(&id, &item.Name, &item.Color); err != nil {
			return nil, err
		}
		item.ID, item.Value = &id, item.Name
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *Repository) CreateProjectType(ctx context.Context, tx *gorm.DB, tenantID uuid.UUID, q CreateProjectTypeRequest) (ProjectType, error) {
	var item ProjectType
	var id uuid.UUID
	err := database.Row(tx, ctx, `INSERT INTO project_types(tenant_id,name,color) VALUES($1,$2,$3) RETURNING id,name,color`, tenantID, q.Name, q.Color).Scan(&id, &item.Name, &item.Color)
	item.ID, item.Value = &id, item.Name
	return item, err
}

func (r *Repository) MetadataFields(ctx context.Context, tenantID uuid.UUID) ([]MetadataField, error) {
	rows, err := database.Rows(r.db, ctx, `SELECT id,name,field_key,field_type,options,is_required,created_at FROM project_metadata_fields WHERE tenant_id=$1 ORDER BY name`, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []MetadataField{}
	for rows.Next() {
		var item MetadataField
		var raw []byte
		if err = rows.Scan(&item.ID, &item.Name, &item.Key, &item.Type, &raw, &item.IsRequired, &item.CreatedAt); err != nil {
			return nil, err
		}
		if err = json.Unmarshal(raw, &item.Options); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *Repository) CreateMetadataField(ctx context.Context, tx *gorm.DB, tenantID uuid.UUID, q CreateMetadataFieldRequest) (MetadataField, error) {
	var item MetadataField
	options, _ := json.Marshal(q.Options)
	err := database.Row(tx, ctx, `INSERT INTO project_metadata_fields(tenant_id,name,field_key,field_type,options,is_required) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,name,field_key,field_type,is_required,created_at`, tenantID, q.Name, q.Key, q.Type, options, q.IsRequired).Scan(&item.ID, &item.Name, &item.Key, &item.Type, &item.IsRequired, &item.CreatedAt)
	item.Options = q.Options
	return item, err
}

func (r *Repository) TeamExists(ctx context.Context, tx *gorm.DB, tenantID, teamID uuid.UUID) (bool, error) {
	var exists bool
	err := database.Row(tx, ctx, `SELECT EXISTS(SELECT 1 FROM teams WHERE tenant_id=$1 AND id=$2)`, tenantID, teamID).Scan(&exists)
	return exists, err
}

func (r *Repository) IsDivisionLeadForTeam(ctx context.Context, tenantID, userID, teamID uuid.UUID) (bool, error) {
	var allowed bool
	err := database.Row(r.db, ctx, `SELECT EXISTS(
		SELECT 1 FROM teams t JOIN division_leads dl ON dl.tenant_id=t.tenant_id AND dl.division_id=t.division_id
		WHERE t.tenant_id=$1 AND t.id=$2 AND dl.user_id=$3
	)`, tenantID, teamID, userID).Scan(&allowed)
	return allowed, err
}

func (r *Repository) CreateUser(ctx context.Context, tx *gorm.DB, tenantID uuid.UUID, q CreateUserRequest) (DirectoryUser, error) {
	var item DirectoryUser
	err := database.Row(tx, ctx, `INSERT INTO users(tenant_id,team_id,name,email,role) VALUES($1,$2,$3,$4,$5) RETURNING id,team_id,name,email,role`, tenantID, q.TeamID, q.Name, q.Email, q.Role).Scan(&item.ID, &item.TeamID, &item.Name, &item.Email, &item.Role)
	return item, err
}
