package projects

import (
	"bytes"
	"encoding/json"
	"errors"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/npms-platform/npms/internal/idempotency"
	"github.com/npms-platform/npms/internal/platform/httpx"
	"github.com/npms-platform/npms/internal/tenant"
	"io"
	"net/http"
	"strings"
)

func projectID(c *gin.Context) (uuid.UUID, error) { return uuid.Parse(c.Param("id")) }
func (h *Handler) Get(c *gin.Context) {
	w, r := c.Writer, c.Request
	id, e := projectID(c)
	if e != nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: "invalid id"})
		return
	}
	v, e := h.service.Get(r.Context(), id)
	if e != nil {
		httpx.WriteError(w, r, 404, httpx.Error{Code: "NOT_FOUND", Message: e.Error()})
		return
	}
	httpx.Write(w, r, 200, v)
}
func (h *Handler) Update(c *gin.Context) {
	w, r := c.Writer, c.Request
	id, e := projectID(c)
	var q UpdateRequest
	if e == nil {
		e = json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&q)
	}
	if e != nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: "invalid payload"})
		return
	}
	v, e := h.service.Update(r.Context(), id, q)
	if e != nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: e.Error()})
		return
	}
	httpx.Write(w, r, 200, v)
}
func (h *Handler) Assign(c *gin.Context) {
	w, r := c.Writer, c.Request
	id, e := projectID(c)
	var q AssignmentRequest
	if e == nil {
		e = json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&q)
	}
	if e != nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: "invalid payload"})
		return
	}
	if e = h.service.Assign(r.Context(), id, q); e != nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: e.Error()})
		return
	}
	httpx.Write(w, r, 200, map[string]any{"assigned": true})
}
func (h *Handler) GenerateChecklist(c *gin.Context) {
	w, r := c.Writer, c.Request
	p, e := tenant.PrincipalFrom(r.Context())
	id, idErr := projectID(c)
	key := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	raw, _ := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20))
	if e != nil || idErr != nil || key == "" {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: "valid id and Idempotency-Key required"})
		return
	}
	stored, e := h.idempotency.Reserve(r.Context(), p, key, idempotency.RequestHash(raw))
	if errors.Is(e, idempotency.ErrPayloadConflict) {
		httpx.WriteError(w, r, 409, httpx.Error{Code: "CONFLICT", Message: "payload conflict"})
		return
	}
	if e != nil {
		httpx.WriteError(w, r, 500, httpx.Error{Code: "INTERNAL_ERROR", Message: e.Error()})
		return
	}
	if stored != nil {
		httpx.WriteRawJSON(w, 200, stored.Body)
		return
	}
	var q ChecklistRequest
	d := json.NewDecoder(bytes.NewReader(raw))
	d.DisallowUnknownFields()
	if e = d.Decode(&q); e != nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: "invalid payload"})
		return
	}
	taskID, e := h.service.GenerateChecklist(r.Context(), id, q)
	if e != nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: e.Error()})
		return
	}
	body, _ := httpx.MarshalResponse(r, map[string]any{"task_id": taskID, "checklist_generated": true})
	if e = h.idempotency.Complete(r.Context(), p, key, idempotency.StoredResponse{Status: 201, Body: body}); e != nil {
		httpx.WriteError(w, r, 500, httpx.Error{Code: "INTERNAL_ERROR", Message: e.Error()})
		return
	}
	httpx.WriteRawJSON(w, 201, body)
}
