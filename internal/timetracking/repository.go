package timetracking

import (
	"context"
	"fmt"
	"github.com/google/uuid"
	"github.com/npms-platform/npms/internal/platform/database"
	"gorm.io/gorm"
)

type Repository struct{ db *gorm.DB }

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }
func (r *Repository) Active(ctx context.Context, tx *gorm.DB, tenantID, userID uuid.UUID) (Entry, error) {
	var e Entry
	err := database.Row(tx, ctx, `SELECT id,task_id,user_id,started_at,ended_at,duration_seconds,auto_closed FROM time_entries WHERE tenant_id=$1 AND user_id=$2 AND ended_at IS NULL FOR UPDATE`, tenantID, userID).Scan(&e.ID, &e.TaskID, &e.UserID, &e.StartedAt, &e.EndedAt, &e.DurationSeconds, &e.AutoClosed)
	return e, err
}
func (r *Repository) Close(ctx context.Context, tx *gorm.DB, tenantID, id uuid.UUID, auto bool) (Entry, error) {
	var e Entry
	err := database.Row(tx, ctx, `UPDATE time_entries SET ended_at=now(),duration_seconds=GREATEST(0,extract(epoch FROM(now()-started_at))::integer),auto_closed=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2 AND ended_at IS NULL RETURNING id,task_id,user_id,started_at,ended_at,duration_seconds,auto_closed`, tenantID, id, auto).Scan(&e.ID, &e.TaskID, &e.UserID, &e.StartedAt, &e.EndedAt, &e.DurationSeconds, &e.AutoClosed)
	if err != nil {
		return Entry{}, fmt.Errorf("close timer: %w", err)
	}
	return e, nil
}
func (r *Repository) Start(ctx context.Context, tx *gorm.DB, tenantID, userID, taskID uuid.UUID) (Entry, error) {
	var e Entry
	err := database.Row(tx, ctx, `INSERT INTO time_entries(tenant_id,user_id,task_id) VALUES($1,$2,$3) RETURNING id,task_id,user_id,started_at,ended_at,duration_seconds,auto_closed`, tenantID, userID, taskID).Scan(&e.ID, &e.TaskID, &e.UserID, &e.StartedAt, &e.EndedAt, &e.DurationSeconds, &e.AutoClosed)
	if err != nil {
		return Entry{}, fmt.Errorf("start timer: %w", err)
	}
	return e, nil
}
func (r *Repository) List(ctx context.Context, tenantID, userID uuid.UUID) ([]Entry, error) {
	rows, err := database.Rows(r.db, ctx, `SELECT id,task_id,user_id,started_at,ended_at,duration_seconds,auto_closed FROM time_entries WHERE tenant_id=$1 AND user_id=$2 ORDER BY started_at DESC LIMIT 100`, tenantID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Entry{}
	for rows.Next() {
		var e Entry
		if err := rows.Scan(&e.ID, &e.TaskID, &e.UserID, &e.StartedAt, &e.EndedAt, &e.DurationSeconds, &e.AutoClosed); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}
