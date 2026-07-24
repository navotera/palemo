package timetracking

import (
	"github.com/google/uuid"
	"time"
)

type Entry struct {
	ID              uuid.UUID  `json:"id"`
	TaskID          uuid.UUID  `json:"task_id"`
	UserID          uuid.UUID  `json:"user_id"`
	StartedAt       time.Time  `json:"started_at"`
	EndedAt         *time.Time `json:"ended_at,omitempty"`
	DurationSeconds *int       `json:"duration_seconds,omitempty"`
	AutoClosed      bool       `json:"auto_closed"`
}
type StartResult struct {
	Entry           Entry  `json:"entry"`
	PreviousStopped bool   `json:"previous_stopped"`
	Warning         string `json:"warning,omitempty"`
}
