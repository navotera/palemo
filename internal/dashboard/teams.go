package dashboard

import (
	"context"
	"github.com/google/uuid"
	"github.com/npms-platform/npms/internal/platform/database"
)

type TeamOption struct {
	ID   uuid.UUID `json:"id"`
	Name string    `json:"name"`
}

func (r *Repository) divisionTeams(ctx context.Context, tenantID, divisionID uuid.UUID) ([]TeamOption, error) {
	rows, err := database.Rows(r.db, ctx, `SELECT id,name FROM teams WHERE tenant_id=$1 AND division_id=$2 ORDER BY name`, tenantID, divisionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []TeamOption{}
	for rows.Next() {
		var team TeamOption
		if err = rows.Scan(&team.ID, &team.Name); err != nil {
			return nil, err
		}
		out = append(out, team)
	}
	return out, rows.Err()
}
