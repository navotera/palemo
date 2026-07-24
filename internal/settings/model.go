package settings

import (
	"time"

	"github.com/google/uuid"
)

type ProjectType struct {
	ID      *uuid.UUID `json:"id,omitempty"`
	Name    string     `json:"name"`
	Value   string     `json:"value"`
	Color   string     `json:"color"`
	BuiltIn bool       `json:"built_in"`
}

type CreateProjectTypeRequest struct {
	Name  string `json:"name"`
	Color string `json:"color"`
}

type MetadataField struct {
	ID         uuid.UUID `json:"id"`
	Name       string    `json:"name"`
	Key        string    `json:"key"`
	Type       string    `json:"type"`
	Options    []string  `json:"options"`
	IsRequired bool      `json:"is_required"`
	CreatedAt  time.Time `json:"created_at"`
}

type CreateMetadataFieldRequest struct {
	Name       string   `json:"name"`
	Key        string   `json:"key"`
	Type       string   `json:"type"`
	Options    []string `json:"options"`
	IsRequired bool     `json:"is_required"`
}

type DirectoryUser struct {
	ID     uuid.UUID `json:"id"`
	TeamID uuid.UUID `json:"team_id"`
	Name   string    `json:"name"`
	Email  string    `json:"email"`
	Role   string    `json:"role"`
}

type CreateUserRequest struct {
	TeamID uuid.UUID `json:"team_id"`
	Name   string    `json:"name"`
	Email  string    `json:"email"`
	Role   string    `json:"role"`
}
