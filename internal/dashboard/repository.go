package dashboard

import (
	"context"
	"fmt"
	"github.com/google/uuid"
	"github.com/npms-platform/npms/internal/platform/database"
	"gorm.io/gorm"
)

type Repository struct{ db *gorm.DB }

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

func (r *Repository) Summary(ctx context.Context, tenantID uuid.UUID) (Summary, error) {
	var summary Summary
	err := database.Row(r.db, ctx, `SELECT t.name,(SELECT count(*) FROM teams WHERE tenant_id=t.id),(SELECT count(*) FROM users WHERE tenant_id=t.id),(SELECT count(*) FROM projects WHERE tenant_id=t.id AND deleted_at IS NULL),(SELECT count(*) FROM tasks WHERE tenant_id=t.id AND deleted_at IS NULL AND board_column<>'done') FROM tenants t WHERE t.id=$1`, tenantID).Scan(&summary.TenantName, &summary.Teams, &summary.Users, &summary.Projects, &summary.OpenTasks)
	if err != nil {
		return Summary{}, fmt.Errorf("query dashboard summary: %w", err)
	}
	rows, err := database.Rows(r.db, ctx, `
		WITH classified AS (
			SELECT d.id division_id,d.name division_name,p.id project_id,p.name project_name,p.status,p.created_at,p.updated_at,
				count(t.id) FILTER (WHERE t.deleted_at IS NULL AND t.board_column<>'done')::int open_tasks,
				count(t.id) FILTER (WHERE t.deleted_at IS NULL AND t.board_column<>'done' AND t.due_date<CURRENT_DATE)::int overdue_tasks,
				CASE WHEN p.status IN ('done','archived') THEN 'closed'
					WHEN EXISTS(SELECT 1 FROM tasks ot WHERE ot.tenant_id=$1 AND ot.project_id=p.id AND ot.deleted_at IS NULL AND ot.board_column<>'done' AND ot.due_date<CURRENT_DATE) THEN 'lagged'
					ELSE 'active' END category
			FROM divisions d LEFT JOIN teams tm ON tm.division_id=d.id AND tm.tenant_id=d.tenant_id
			LEFT JOIN projects p ON p.team_id=tm.id AND p.tenant_id=d.tenant_id AND p.deleted_at IS NULL
			LEFT JOIN tasks t ON t.project_id=p.id AND t.tenant_id=d.tenant_id
			WHERE d.tenant_id=$1 GROUP BY d.id,d.name,p.id,p.name,p.status,p.created_at,p.updated_at
		)
		SELECT division_id,division_name,
			count(project_id) FILTER(WHERE category='active')::int,
			count(project_id) FILTER(WHERE category='closed')::int,
			count(project_id) FILTER(WHERE category='lagged')::int,
			CASE WHEN count(project_id)=0 THEN 0 ELSE round(100.0*count(project_id) FILTER(WHERE category='closed')/count(project_id),1) END,
			COALESCE(round(avg(EXTRACT(EPOCH FROM(updated_at-created_at))/86400.0) FILTER(WHERE category='closed' AND date_part('year',updated_at)=date_part('year',CURRENT_DATE)),1),0)
		FROM classified GROUP BY division_id,division_name
		ORDER BY count(project_id) FILTER(WHERE category<>'closed') DESC,division_name`, tenantID)
	if err != nil {
		return Summary{}, fmt.Errorf("query division performance: %w", err)
	}
	defer rows.Close()
	summary.Divisions = []DivisionPerformance{}
	for rows.Next() {
		var d DivisionPerformance
		if err = rows.Scan(&d.ID, &d.Name, &d.Active, &d.Closed, &d.Lagged, &d.KPIAchievement, &d.AverageFinishDays); err != nil {
			return Summary{}, err
		}
		projects, queryErr := r.activeProjects(ctx, tenantID, d.ID)
		if queryErr != nil {
			return Summary{}, queryErr
		}
		d.ActiveProjects = projects
		teams, teamErr := r.divisionTeams(ctx, tenantID, d.ID)
		if teamErr != nil {
			return Summary{}, teamErr
		}
		d.Teams = teams
		summary.Divisions = append(summary.Divisions, d)
	}
	return summary, rows.Err()
}

func (r *Repository) activeProjects(ctx context.Context, tenantID, divisionID uuid.UUID) ([]ActiveProject, error) {
	rows, err := database.Rows(r.db, ctx, `SELECT p.id,p.name,p.status,count(t.id) FILTER(WHERE t.deleted_at IS NULL AND t.board_column<>'done')::int,count(t.id) FILTER(WHERE t.deleted_at IS NULL AND t.board_column<>'done' AND t.due_date<CURRENT_DATE)::int FROM projects p JOIN teams tm ON tm.id=p.team_id AND tm.tenant_id=p.tenant_id LEFT JOIN tasks t ON t.project_id=p.id AND t.tenant_id=p.tenant_id WHERE p.tenant_id=$1 AND tm.division_id=$2 AND p.deleted_at IS NULL AND p.status NOT IN ('done','archived') GROUP BY p.id,p.name,p.status ORDER BY count(t.id) FILTER(WHERE t.deleted_at IS NULL AND t.board_column<>'done') DESC,p.updated_at DESC`, tenantID, divisionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ActiveProject{}
	for rows.Next() {
		var p ActiveProject
		if err = rows.Scan(&p.ID, &p.Name, &p.Status, &p.OpenTasks, &p.OverdueTasks); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}
