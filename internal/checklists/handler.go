package checklists

import (
	"encoding/json"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/npms-platform/npms/internal/platform/httpx"
)

type Handler struct{ service *Service }

func NewHandler(s *Service) *Handler { return &Handler{service: s} }
func (h *Handler) List(c *gin.Context) {
	w, r := c.Writer, c.Request
	id, e := uuid.Parse(c.Param("taskID"))
	if e != nil {
		httpx.WriteError(w, r, 404, httpx.Error{Code: "NOT_FOUND", Message: "task not found"})
		return
	}
	items, e := h.service.List(r.Context(), id)
	if e != nil {
		httpx.WriteError(w, r, 500, httpx.Error{Code: "INTERNAL_ERROR", Message: "could not list checklist"})
		return
	}
	httpx.Write(w, r, 200, items)
}
func (h *Handler) Create(c *gin.Context) {
	w, r := c.Writer, c.Request
	id, e := uuid.Parse(c.Param("taskID"))
	var body struct {
		Label string `json:"label"`
	}
	if e != nil || json.NewDecoder(r.Body).Decode(&body) != nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: "invalid checklist item"})
		return
	}
	item, e := h.service.Create(r.Context(), id, body.Label)
	if e != nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: e.Error()})
		return
	}
	httpx.Write(w, r, 201, item)
}
func (h *Handler) Toggle(c *gin.Context) {
	w, r := c.Writer, c.Request
	id, e := uuid.Parse(c.Param("id"))
	var body struct {
		Done bool `json:"is_done"`
	}
	if e != nil || json.NewDecoder(r.Body).Decode(&body) != nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: "invalid checklist update"})
		return
	}
	item, e := h.service.Toggle(r.Context(), id, body.Done)
	if e != nil {
		httpx.WriteError(w, r, 404, httpx.Error{Code: "NOT_FOUND", Message: "checklist item not found"})
		return
	}
	httpx.Write(w, r, 200, item)
}
