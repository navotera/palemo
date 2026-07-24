package tasks

import (
	"context"
	"fmt"
	"github.com/npms-platform/npms/internal/platform/database"
	"gorm.io/gorm"

	"github.com/google/uuid"
)

type Repository struct{ db *gorm.DB }

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

func (r *Repository) List(ctx context.Context, tenantID, projectID uuid.UUID) ([]Task, error) {
	rows, err := database.Rows(r.db, ctx, `SELECT id,project_id,assignee_id,title,description,board_column,position,due_date,created_at,updated_at FROM tasks WHERE tenant_id=$1 AND project_id=$2 AND deleted_at IS NULL ORDER BY board_column,position,created_at`, tenantID, projectID)
	if err != nil {
		return nil, fmt.Errorf("list tasks: %w", err)
	}
	defer rows.Close()
	items := make([]Task, 0)
	for rows.Next() {
		var item Task
		if err := rows.Scan(&item.ID, &item.ProjectID, &item.AssigneeID, &item.Title, &item.Description, &item.BoardColumn, &item.Position, &item.DueDate, &item.CreatedAt, &item.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan task: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *Repository) Create(ctx context.Context, tx *gorm.DB, tenantID uuid.UUID, request CreateRequest) (Task, error) {
	var item Task
	err := database.Row(tx, ctx, `INSERT INTO tasks(tenant_id,project_id,assignee_id,title,description,due_date,position) SELECT $1,$2,$3,$4,$5,$6,COALESCE(max(position)+1,0) FROM tasks WHERE tenant_id=$1 AND project_id=$2 AND board_column='todo' RETURNING id,project_id,assignee_id,title,description,board_column,position,due_date,created_at,updated_at`, tenantID, request.ProjectID, request.AssigneeID, request.Title, request.Description, request.DueDate).Scan(&item.ID, &item.ProjectID, &item.AssigneeID, &item.Title, &item.Description, &item.BoardColumn, &item.Position, &item.DueDate, &item.CreatedAt, &item.UpdatedAt)
	if err != nil {
		return Task{}, fmt.Errorf("create task: %w", err)
	}
	return item, nil
}

func (r *Repository) GetForUpdate(ctx context.Context, tx *gorm.DB, tenantID, id uuid.UUID) (Task, error) {
	var item Task
	err := database.Row(tx, ctx, `SELECT id,project_id,assignee_id,title,description,board_column,position,due_date,created_at,updated_at FROM tasks WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL FOR UPDATE`, tenantID, id).Scan(&item.ID, &item.ProjectID, &item.AssigneeID, &item.Title, &item.Description, &item.BoardColumn, &item.Position, &item.DueDate, &item.CreatedAt, &item.UpdatedAt)
	if database.IsNotFound(err) {
		return Task{}, database.ErrNotFound
	}
	if err != nil {
		return Task{}, fmt.Errorf("get task: %w", err)
	}
	return item, nil
}

func (r *Repository) UpdateBoard(ctx context.Context, tx *gorm.DB, tenantID, id uuid.UUID, request UpdateRequest) (Task, error) {
	var item Task
	err := database.Row(tx, ctx, `UPDATE tasks SET board_column=$3,position=$4,updated_at=now() WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL RETURNING id,project_id,assignee_id,title,description,board_column,position,due_date,created_at,updated_at`, tenantID, id, request.BoardColumn, request.Position).Scan(&item.ID, &item.ProjectID, &item.AssigneeID, &item.Title, &item.Description, &item.BoardColumn, &item.Position, &item.DueDate, &item.CreatedAt, &item.UpdatedAt)
	if err != nil {
		return Task{}, fmt.Errorf("update task: %w", err)
	}
	return item, nil
}
