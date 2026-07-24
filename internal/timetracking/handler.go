package timetracking

import (
	"encoding/json"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/npms-platform/npms/internal/platform/httpx"
)

type Handler struct{ service *Service }

func NewHandler(s *Service) *Handler { return &Handler{service: s} }
func (h *Handler) Start(c *gin.Context) {
	w, r := c.Writer, c.Request
	var body struct {
		TaskID uuid.UUID `json:"task_id"`
	}
	if json.NewDecoder(r.Body).Decode(&body) != nil || body.TaskID == uuid.Nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Field: "task_id", Message: "valid task_id required"})
		return
	}
	result, e := h.service.Start(r.Context(), body.TaskID)
	if e != nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: e.Error()})
		return
	}
	httpx.Write(w, r, 201, result)
}
func (h *Handler) Stop(c *gin.Context) {
	w, r := c.Writer, c.Request
	var body struct {
		TimeEntryID uuid.UUID `json:"time_entry_id"`
	}
	if json.NewDecoder(r.Body).Decode(&body) != nil || body.TimeEntryID == uuid.Nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Field: "time_entry_id", Message: "valid time_entry_id required"})
		return
	}
	entry, e := h.service.Stop(r.Context(), body.TimeEntryID)
	if e != nil {
		httpx.WriteError(w, r, 404, httpx.Error{Code: "NOT_FOUND", Message: "active timer not found"})
		return
	}
	httpx.Write(w, r, 200, entry)
}
func (h *Handler) List(c *gin.Context) {
	w, r := c.Writer, c.Request
	entries, e := h.service.List(r.Context())
	if e != nil {
		httpx.WriteError(w, r, 500, httpx.Error{Code: "INTERNAL_ERROR", Message: "could not list timers"})
		return
	}
	httpx.Write(w, r, 200, entries)
}
