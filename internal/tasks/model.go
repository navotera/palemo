package tasks

import (
	"time"

	"github.com/google/uuid"
)

type Task struct {
	ID          uuid.UUID  `json:"id"`
	ProjectID   uuid.UUID  `json:"project_id"`
	AssigneeID  *uuid.UUID `json:"assignee_id,omitempty"`
	Title       string     `json:"title"`
	Description string     `json:"description"`
	BoardColumn string     `json:"board_column"`
	Position    int        `json:"position"`
	DueDate     *time.Time `json:"due_date,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

type CreateRequest struct {
	ProjectID   uuid.UUID  `json:"project_id"`
	AssigneeID  *uuid.UUID `json:"assignee_id"`
	Title       string     `json:"title"`
	Description string     `json:"description"`
	DueDate     *time.Time `json:"due_date"`
}

type UpdateRequest struct {
	Description string `json:"description"`
	BoardColumn string `json:"board_column"`
	Position    int    `json:"position"`
}
