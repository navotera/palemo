// Package bootstrap is the application composition root. It owns infrastructure,
// service construction, controller construction, and route registration.
package bootstrap

import (
	"net/http"
	"os"

	"github.com/npms-platform/npms/internal/assistant"
	"github.com/npms-platform/npms/internal/auth"
	"github.com/npms-platform/npms/internal/automation"
	"github.com/npms-platform/npms/internal/checklists"
	"github.com/npms-platform/npms/internal/clientauth"
	"github.com/npms-platform/npms/internal/dashboard"
	"github.com/npms-platform/npms/internal/githubintegration"
	"github.com/npms-platform/npms/internal/health"
	"github.com/npms-platform/npms/internal/idempotency"
	"github.com/npms-platform/npms/internal/knowledge"
	"github.com/npms-platform/npms/internal/notifications"
	"github.com/npms-platform/npms/internal/openapi"
	"github.com/npms-platform/npms/internal/organization"
	"github.com/npms-platform/npms/internal/platform/database"
	"github.com/npms-platform/npms/internal/projects"
	"github.com/npms-platform/npms/internal/reports"
	"github.com/npms-platform/npms/internal/reviews"
	"github.com/npms-platform/npms/internal/routes"
	"github.com/npms-platform/npms/internal/settings"
	"github.com/npms-platform/npms/internal/sops"
	"github.com/npms-platform/npms/internal/tasks"
	"github.com/npms-platform/npms/internal/templates"
	"github.com/npms-platform/npms/internal/timetracking"
	"github.com/npms-platform/npms/internal/webhooks"
)

func NewHTTP(connection *database.Connection) http.Handler {
	db := connection.GORM
	environment := envOrDefault("APP_ENV", "development")
	secret := os.Getenv("SESSION_SECRET")
	if secret == "" && environment == "development" {
		secret = "development-session-secret-change-before-production"
	}

	authService := auth.NewService(db, environment, secret)
	authService.SetSSOSecret(os.Getenv("SSO_SHARED_SECRET"))
	clientService := clientauth.NewService(db, secret)
	userIdempotency := idempotency.NewUserService(db)
	principalIdempotency := idempotency.NewPrincipalService(userIdempotency, idempotency.NewService(db))
	checklistService := checklists.NewService(db)

	controllers := routes.Controllers{
		Assistant:       assistant.NewHandler(assistant.NewService(db), userIdempotency),
		Auth:            auth.NewHandler(authService),
		Automation:      automation.NewHandler(automation.NewService(db), principalIdempotency),
		Checklist:       checklists.NewHandler(checklistService),
		ChecklistCreate: checklists.NewIdempotentHandler(checklistService, principalIdempotency),
		Client:          clientauth.NewHandler(clientService, userIdempotency),
		Dashboard:       dashboard.NewHandler(dashboard.NewService(dashboard.NewRepository(db))),
		GitHub:          githubintegration.NewHandler(githubintegration.NewService(db), principalIdempotency),
		Health:          health.NewController(db),
		Knowledge:       knowledge.NewHandler(knowledge.NewService(db), principalIdempotency),
		Notification:    notifications.NewHandler(notifications.NewService(db), principalIdempotency),
		Organization:    organization.NewHandler(organization.NewService(db, organization.NewRepository(db)), principalIdempotency),
		Project:         projects.NewHandler(projects.NewService(db, projects.NewRepository(db)), principalIdempotency),
		Report:          reports.NewHandler(reports.NewService(db)),
		Review:          reviews.NewHandler(reviews.NewService(db), userIdempotency),
		Settings:        settings.NewHandler(settings.NewService(db, settings.NewRepository(db)), principalIdempotency),
		SOP:             sops.NewHandler(sops.NewService(db), principalIdempotency),
		Task:            tasks.NewHandler(tasks.NewService(db, tasks.NewRepository(db)), principalIdempotency),
		Template:        templates.NewHandler(templates.NewService(db), principalIdempotency),
		TimeTracking:    timetracking.NewHandler(timetracking.NewService(db, timetracking.NewRepository(db))),
		Webhook:         webhooks.NewHandler(webhooks.NewService(db), principalIdempotency),
	}

	return routes.Register(routes.Dependencies{
		Controllers: controllers,
		Principal:   clientauth.NewMiddleware(authService, clientService),
		OpenAPI:     openapi.Handler,
	})
}

func envOrDefault(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
