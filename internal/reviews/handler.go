package reviews

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
	service *Service
	idem    *idempotency.UserService
}

func NewHandler(service *Service, idem *idempotency.UserService) *Handler {
	return &Handler{service: service, idem: idem}
}
func (h *Handler) List(c *gin.Context) {
	w, r := c.Writer, c.Request
	var entityID *uuid.UUID
	if value := r.URL.Query().Get("entity_id"); value != "" {
		id, e := uuid.Parse(value)
		if e != nil {
			httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Field: "entity_id", Message: "valid entity_id required"})
			return
		}
		entityID = &id
	}
	items, e := h.service.List(r.Context(), r.URL.Query().Get("entity_type"), entityID)
	if e != nil {
		httpx.WriteError(w, r, 500, httpx.Error{Code: "INTERNAL_ERROR", Message: "could not list reviews"})
		return
	}
	httpx.Write(w, r, 200, items)
}
func (h *Handler) Create(c *gin.Context) {
	w, r := c.Writer, c.Request
	p, e := tenant.PrincipalFrom(r.Context())
	if e != nil || p.ActorID == nil {
		httpx.WriteError(w, r, 401, httpx.Error{Code: "UNAUTHORIZED", Message: "sign in required"})
		return
	}
	key := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	if key == "" {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Field: "Idempotency-Key", Message: "Idempotency-Key required"})
		return
	}
	raw, e := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20))
	if e != nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: "invalid body"})
		return
	}
	stored, e := h.idem.Reserve(r.Context(), p.TenantID, *p.ActorID, key, idempotency.RequestHash(raw))
	if errors.Is(e, idempotency.ErrPayloadConflict) {
		httpx.WriteError(w, r, 409, httpx.Error{Code: "CONFLICT", Message: "idempotency payload conflict"})
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
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&request) != nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: "invalid review"})
		return
	}
	item, e := h.service.Create(r.Context(), request)
	if e != nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: e.Error()})
		return
	}
	response, e := httpx.MarshalResponse(r, item)
	if e != nil || h.idem.Complete(r.Context(), p.TenantID, *p.ActorID, key, idempotency.StoredResponse{Status: 201, Body: response}) != nil {
		httpx.WriteError(w, r, 500, httpx.Error{Code: "INTERNAL_ERROR", Message: "could not persist response"})
		return
	}
	httpx.WriteRawJSON(w, 201, response)
}
func (h *Handler) Update(c *gin.Context) {
	w, r := c.Writer, c.Request
	id, e := uuid.Parse(c.Param("id"))
	var body struct {
		Status string  `json:"status"`
		Notes  *string `json:"notes"`
	}
	if e != nil || json.NewDecoder(r.Body).Decode(&body) != nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: "invalid review update"})
		return
	}
	item, e := h.service.Update(r.Context(), id, body.Status, body.Notes)
	if e != nil {
		status := 400
		if database.IsNotFound(e) {
			status = 404
		}
		httpx.WriteError(w, r, status, httpx.Error{Code: "VALIDATION_ERROR", Message: e.Error()})
		return
	}
	httpx.Write(w, r, 200, item)
}
