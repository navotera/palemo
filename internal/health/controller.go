package health

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/npms-platform/npms/internal/platform/httpx"
	"gorm.io/gorm"
)

// Controller provides Gin-native liveness and GORM-backed readiness endpoints.
type Controller struct {
	db *gorm.DB
}

func NewController(db *gorm.DB) *Controller {
	return &Controller{db: db}
}

func (h *Controller) Live(c *gin.Context) {
	httpx.Write(c.Writer, c.Request, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Controller) Ready(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), time.Second)
	defer cancel()

	db, err := h.db.DB()
	if err == nil {
		err = db.PingContext(ctx)
	}
	if err != nil {
		httpx.WriteError(c.Writer, c.Request, http.StatusServiceUnavailable, httpx.Error{
			Code: "SERVICE_UNAVAILABLE", Message: "database is unavailable",
		})
		return
	}

	httpx.Write(c.Writer, c.Request, http.StatusOK, map[string]string{"status": "ready"})
}
