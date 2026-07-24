package auth

import "github.com/google/uuid"

const SessionCookieName = "npms_session"

type User struct {
	ID       uuid.UUID `json:"id"`
	TenantID uuid.UUID `json:"tenant_id"`
	TeamID   uuid.UUID `json:"team_id"`
	Name     string    `json:"name"`
	Email    string    `json:"email"`
	Role     string    `json:"role"`
	Tenant   string    `json:"tenant"`
	Team     string    `json:"team"`
}

type Session struct {
	Token     string `json:"-"`
	ExpiresAt int64  `json:"expires_at"`
	User      User   `json:"user"`
}
