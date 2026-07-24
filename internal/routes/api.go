package routes

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/npms-platform/npms/internal/assistant"
	"github.com/npms-platform/npms/internal/auth"
	"github.com/npms-platform/npms/internal/automation"
	"github.com/npms-platform/npms/internal/checklists"
	"github.com/npms-platform/npms/internal/clientauth"
	"github.com/npms-platform/npms/internal/dashboard"
	"github.com/npms-platform/npms/internal/githubintegration"
	"github.com/npms-platform/npms/internal/health"
	httpmiddleware "github.com/npms-platform/npms/internal/http/middleware"
	"github.com/npms-platform/npms/internal/knowledge"
	"github.com/npms-platform/npms/internal/notifications"
	"github.com/npms-platform/npms/internal/organization"
	"github.com/npms-platform/npms/internal/platform/httpx"
	"github.com/npms-platform/npms/internal/projects"
	"github.com/npms-platform/npms/internal/reports"
	"github.com/npms-platform/npms/internal/reviews"
	"github.com/npms-platform/npms/internal/settings"
	"github.com/npms-platform/npms/internal/sops"
	"github.com/npms-platform/npms/internal/tasks"
	"github.com/npms-platform/npms/internal/templates"
	"github.com/npms-platform/npms/internal/timetracking"
	"github.com/npms-platform/npms/internal/webhooks"
	dashboardui "github.com/npms-platform/npms/web"
)

type Controllers struct {
	Assistant       *assistant.Handler
	Auth            *auth.Handler
	Automation      *automation.Handler
	Checklist       *checklists.Handler
	ChecklistCreate *checklists.IdempotentHandler
	Client          *clientauth.Handler
	Dashboard       *dashboard.Handler
	GitHub          *githubintegration.Handler
	Health          *health.Controller
	Knowledge       *knowledge.Handler
	Notification    *notifications.Handler
	Organization    *organization.Handler
	Project         *projects.Handler
	Report          *reports.Handler
	Review          *reviews.Handler
	Settings        *settings.Handler
	SOP             *sops.Handler
	Task            *tasks.Handler
	Template        *templates.Handler
	TimeTracking    *timetracking.Handler
	Webhook         *webhooks.Handler
}

type Dependencies struct {
	Controllers Controllers
	Principal   *clientauth.Middleware
	OpenAPI     gin.HandlerFunc
}

func Register(deps Dependencies) *gin.Engine {
	controllers := deps.Controllers
	router := gin.New()
	router.Use(httpx.RequestIDMiddleware(), httpmiddleware.Recovery())
	router.GET("/health/live", controllers.Health.Live)
	router.GET("/health/ready", controllers.Health.Ready)
	router.GET("/openapi.yaml", deps.OpenAPI)

	api := router.Group("/api/v1")
	api.POST("/auth/development-session", controllers.Auth.DevelopmentSession)
	api.POST("/auth/sso", controllers.Auth.SSO)
	api.POST("/auth/token", controllers.Client.Token)
	api.POST("/integrations/github/webhook", controllers.GitHub.Webhook)

	secured := api.Group("")
	secured.Use(deps.Principal.RequirePrincipal)
	secured.GET("/auth/me", controllers.Auth.CurrentUser)
	secured.POST("/auth/logout", controllers.Auth.Logout)
	secured.GET("/dashboard/summary", controllers.Dashboard.Summary)
	secured.GET("/api-clients", controllers.Client.List)
	secured.GET("/api-clients/usage", controllers.Client.Usage)
	secured.POST("/api-clients", controllers.Client.Register)
	secured.GET("/divisions", controllers.Organization.List)
	secured.GET("/users", controllers.Project.Users)
	secured.POST("/divisions", controllers.Organization.Create)
	secured.PUT("/divisions/:id/leads", controllers.Organization.SetLeads)
	secured.GET("/settings/project-types", controllers.Settings.ProjectTypes)
	secured.POST("/settings/project-types", controllers.Settings.CreateProjectType)
	secured.GET("/settings/project-metadata-fields", controllers.Settings.MetadataFields)
	secured.POST("/settings/project-metadata-fields", controllers.Settings.CreateMetadataField)
	secured.POST("/settings/users", controllers.Settings.CreateUser)
	secured.GET("/projects", controllers.Project.List)
	secured.GET("/preliminary-note-templates", controllers.Project.PreliminaryNoteTemplates)
	secured.POST("/projects", controllers.Project.Create)
	secured.GET("/projects/:id", controllers.Project.Get)
	secured.PATCH("/projects/:id", controllers.Project.Update)
	secured.POST("/projects/:id/assign", controllers.Project.Assign)
	secured.POST("/projects/:id/submit-review", controllers.Project.SubmitReview)
	secured.POST("/projects/:id/checklist", controllers.Project.GenerateChecklist)
	secured.GET("/projects/:id/finish-attachments", controllers.Project.FinishAttachments)
	secured.POST("/projects/:id/finish-attachments", controllers.Project.UploadFinishAttachment)
	secured.GET("/projects/:id/finish-attachments/:attachmentID", controllers.Project.DownloadFinishAttachment)
	secured.GET("/tasks", controllers.Task.List)
	secured.POST("/tasks", controllers.Task.Create)
	secured.PATCH("/tasks/:taskID", controllers.Task.Update)
	secured.GET("/tasks/:taskID/checklist", controllers.Checklist.List)
	secured.POST("/tasks/:taskID/checklist", controllers.ChecklistCreate.Create)
	secured.PATCH("/tasks/:taskID/checklist/:id", controllers.Checklist.Toggle)
	secured.GET("/time-entries", controllers.TimeTracking.List)
	secured.POST("/time-entries/start", controllers.TimeTracking.Start)
	secured.POST("/time-entries/stop", controllers.TimeTracking.Stop)
	secured.GET("/reviews", controllers.Review.List)
	secured.POST("/reviews", controllers.Review.Create)
	secured.PATCH("/reviews/:id", controllers.Review.Update)
	secured.GET("/reports/productivity", controllers.Report.Productivity)
	secured.GET("/reports/productivity.pdf", controllers.Report.PDF)
	secured.GET("/webhooks/subscriptions", controllers.Webhook.List)
	secured.POST("/webhooks/subscriptions", controllers.Webhook.Create)
	secured.DELETE("/webhooks/subscriptions/:id", controllers.Webhook.Delete)
	secured.GET("/webhooks/deliveries", controllers.Webhook.Deliveries)
	secured.GET("/notifications", controllers.Notification.List)
	secured.POST("/notifications", controllers.Notification.Create)
	secured.PATCH("/notifications/:id/read", controllers.Notification.Read)
	secured.GET("/integrations/github/links", controllers.GitHub.List)
	secured.POST("/integrations/github/link", controllers.GitHub.Link)
	secured.GET("/search", controllers.Knowledge.Search)
	secured.GET("/knowledge/workspaces", controllers.Knowledge.Workspaces)
	secured.POST("/knowledge/workspaces", controllers.Knowledge.CreateWorkspace)
	secured.GET("/knowledge/:kind", controllers.Knowledge.List)
	secured.POST("/knowledge/:kind", controllers.Knowledge.Create)
	secured.PATCH("/knowledge/:kind/:id", controllers.Knowledge.Update)
	secured.GET("/sops", controllers.SOP.List)
	secured.POST("/sops", controllers.SOP.Create)
	secured.POST("/sops/:id/apply", controllers.SOP.Apply)
	secured.GET("/automations/rules", controllers.Automation.List)
	secured.POST("/automations/rules", controllers.Automation.Create)
	secured.PATCH("/automations/rules/:id", controllers.Automation.SetActive)
	secured.GET("/assistant/history", controllers.Assistant.History)
	secured.POST("/assistant/query", controllers.Assistant.Query)
	secured.GET("/templates", controllers.Template.List)
	secured.POST("/templates", controllers.Template.Capture)
	secured.GET("/templates/marketplace", controllers.Template.Marketplace)
	secured.POST("/templates/marketplace", controllers.Template.Publish)

	staticHandler := dashboardui.Handler()
	router.NoRoute(func(c *gin.Context) {
		if strings.HasPrefix(c.Request.URL.Path, "/api/") {
			httpx.WriteError(c.Writer, c.Request, http.StatusNotFound, httpx.Error{Code: "NOT_FOUND", Message: "resource not found"})
			return
		}
		staticHandler.ServeHTTP(c.Writer, c.Request)
	})
	return router
}
