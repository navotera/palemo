package tasks

import (
	"bytes"
	"encoding/json"
	"errors"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/npms-platform/npms/internal/idempotency"
	"github.com/npms-platform/npms/internal/platform/database"
	"github.com/npms-platform/npms/internal/platform/httpx"
	"github.com/npms-platform/npms/internal/tenant"
	"io"
	"net/http"
	"strings"
)

type Handler struct {
	service     *Service
	idempotency *idempotency.PrincipalService
}

func NewHandler(service *Service, idem *idempotency.PrincipalService) *Handler {
	return &Handler{service: service, idempotency: idem}
}
func (h *Handler) List(c *gin.Context) {
	w, r := c.Writer, c.Request
	projectID, e := uuid.Parse(r.URL.Query().Get("project_id"))
	if e != nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Field: "project_id", Message: "valid project_id is required"})
		return
	}
	items, e := h.service.List(r.Context(), projectID)
	if e != nil {
		httpx.WriteError(w, r, 500, httpx.Error{Code: "INTERNAL_ERROR", Message: "could not list tasks"})
		return
	}
	httpx.Write(w, r, 200, items)
}
func (h *Handler) Create(c *gin.Context) {
	w, r := c.Writer, c.Request
	p, e := tenant.PrincipalFrom(r.Context())
	if e != nil || (p.ActorID == nil && p.APIClientID == nil) {
		httpx.WriteError(w, r, 401, httpx.Error{Code: "UNAUTHORIZED", Message: "sign in required"})
		return
	}
	key := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	if key == "" {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Field: "Idempotency-Key", Message: "Idempotency-Key is required"})
		return
	}
	body, e := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20))
	if e != nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: "invalid body"})
		return
	}
	stored, e := h.idempotency.Reserve(r.Context(), p, key, idempotency.RequestHash(body))
	if errors.Is(e, idempotency.ErrPayloadConflict) {
		httpx.WriteError(w, r, 409, httpx.Error{Code: "CONFLICT", Message: "idempotency key payload conflict"})
		return
	}
	if e != nil {
		httpx.WriteError(w, r, 500, httpx.Error{Code: "INTERNAL_ERROR", Message: "could not reserve request"})
		return
	}
	if stored != nil {
		httpx.WriteRawJSON(w, 200, stored.Body)
		return
	}
	var request CreateRequest
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if e = decoder.Decode(&request); e != nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: "invalid task payload"})
		return
	}
	item, e := h.service.Create(r.Context(), request)
	if e != nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: e.Error()})
		return
	}
	response, e := httpx.MarshalResponse(r, item)
	if e != nil || h.idempotency.Complete(r.Context(), p, key, idempotency.StoredResponse{Status: 201, Body: response}) != nil {
		httpx.WriteError(w, r, 500, httpx.Error{Code: "INTERNAL_ERROR", Message: "could not persist response"})
		return
	}
	httpx.WriteRawJSON(w, 201, response)
}
func (h *Handler) Update(c *gin.Context) {
	w, r := c.Writer, c.Request
	id, e := uuid.Parse(c.Param("taskID"))
	if e != nil {
		httpx.WriteError(w, r, 404, httpx.Error{Code: "NOT_FOUND", Message: "task not found"})
		return
	}
	var request UpdateRequest
	if e = json.NewDecoder(r.Body).Decode(&request); e != nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: "invalid task update"})
		return
	}
	item, e := h.service.UpdateBoard(r.Context(), id, request)
	if database.IsNotFound(e) {
		httpx.WriteError(w, r, 404, httpx.Error{Code: "NOT_FOUND", Message: "task not found"})
		return
	}
	if e != nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: e.Error()})
		return
	}
	httpx.Write(w, r, 200, item)
}
