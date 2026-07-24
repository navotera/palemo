package organization

import (
	"github.com/google/uuid"
	"time"
)

type Team struct {
	ID   uuid.UUID `json:"id"`
	Name string    `json:"name"`
}
type Division struct {
	ID               uuid.UUID   `json:"id"`
	ParentDivisionID *uuid.UUID  `json:"parent_division_id,omitempty"`
	Name             string      `json:"name"`
	Teams            []Team      `json:"teams"`
	LeadUserIDs      []uuid.UUID `json:"lead_user_ids"`
	CreatedAt        time.Time   `json:"created_at"`
}
type SetLeadsRequest struct {
	UserIDs []uuid.UUID `json:"user_ids"`
}
type CreateRequest struct {
	Name             string     `json:"name"`
	ParentDivisionID *uuid.UUID `json:"parent_division_id"`
	InitialTeamName  string     `json:"initial_team_name"`
}
