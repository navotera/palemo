package dashboard

import (
	"github.com/gin-gonic/gin"
	"net/http"

	"github.com/npms-platform/npms/internal/platform/httpx"
)

type Handler struct{ service *Service }

func NewHandler(service *Service) *Handler { return &Handler{service: service} }

func (h *Handler) Summary(c *gin.Context) {
	w, r := c.Writer, c.Request
	summary, err := h.service.Summary(r.Context())
	if err != nil {
		httpx.WriteError(w, r, http.StatusInternalServerError, httpx.Error{Code: "INTERNAL_ERROR", Message: "could not load dashboard"})
		return
	}
	httpx.Write(w, r, http.StatusOK, summary)
}
