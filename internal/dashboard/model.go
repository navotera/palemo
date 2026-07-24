package dashboard

import "github.com/google/uuid"

type ActiveProject struct {
	ID           uuid.UUID `json:"id"`
	Name         string    `json:"name"`
	Status       string    `json:"status"`
	OpenTasks    int       `json:"open_tasks"`
	OverdueTasks int       `json:"overdue_tasks"`
}

type DivisionPerformance struct {
	ID                uuid.UUID       `json:"id"`
	Name              string          `json:"name"`
	Active            int             `json:"active"`
	Closed            int             `json:"closed"`
	Lagged            int             `json:"lagged"`
	KPIAchievement    float64         `json:"kpi_achievement"`
	AverageFinishDays float64         `json:"average_finish_days"`
	ActiveProjects    []ActiveProject `json:"active_projects"`
	Teams             []TeamOption    `json:"teams"`
}

type Summary struct {
	TenantName string                `json:"tenant_name"`
	Teams      int                   `json:"teams"`
	Users      int                   `json:"users"`
	Projects   int                   `json:"projects"`
	OpenTasks  int                   `json:"open_tasks"`
	Divisions  []DivisionPerformance `json:"divisions"`
}
