package knowledge

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

type Handler struct {
	service *Service
	idem    *idempotency.PrincipalService
}

func NewHandler(service *Service, idem *idempotency.PrincipalService) *Handler {
	return &Handler{service: service, idem: idem}
}
func (h *Handler) Workspaces(c *gin.Context) {
	w, r := c.Writer, c.Request
	items, e := h.service.Workspaces(r.Context())
	if e != nil {
		httpx.WriteError(w, r, 500, httpx.Error{Code: "INTERNAL_ERROR", Message: "could not list workspaces"})
		return
	}
	httpx.Write(w, r, 200, items)
}
func (h *Handler) List(c *gin.Context) {
	w, r := c.Writer, c.Request
	items, e := h.service.List(r.Context(), c.Param("kind"), r.URL.Query().Get("q"))
	if e != nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: e.Error()})
		return
	}
	httpx.Write(w, r, 200, items)
}
func (h *Handler) reserve(w http.ResponseWriter, r *http.Request) (tenant.Principal, []byte, *idempotency.StoredResponse, bool) {
	p, e := tenant.PrincipalFrom(r.Context())
	if e != nil {
		httpx.WriteError(w, r, 401, httpx.Error{Code: "UNAUTHORIZED", Message: "authentication required"})
		return p, nil, nil, false
	}
	key := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	if key == "" {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Field: "Idempotency-Key", Message: "Idempotency-Key required"})
		return p, nil, nil, false
	}
	raw, e := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20))
	if e != nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: "invalid body"})
		return p, nil, nil, false
	}
	stored, e := h.idem.Reserve(r.Context(), p, key, idempotency.RequestHash(raw))
	if errors.Is(e, idempotency.ErrPayloadConflict) {
		httpx.WriteError(w, r, 409, httpx.Error{Code: "CONFLICT", Message: "idempotency payload conflict"})
		return p, nil, nil, false
	}
	if e != nil {
		httpx.WriteError(w, r, 500, httpx.Error{Code: "INTERNAL_ERROR", Message: "could not reserve request"})
		return p, nil, nil, false
	}
	return p, raw, stored, true
}
func (h *Handler) complete(w http.ResponseWriter, r *http.Request, p tenant.Principal, item any) {
	response, e := httpx.MarshalResponse(r, item)
	if e != nil || h.idem.Complete(r.Context(), p, strings.TrimSpace(r.Header.Get("Idempotency-Key")), idempotency.StoredResponse{Status: 201, Body: response}) != nil {
		httpx.WriteError(w, r, 500, httpx.Error{Code: "INTERNAL_ERROR", Message: "could not persist response"})
		return
	}
	httpx.WriteRawJSON(w, 201, response)
}
func (h *Handler) CreateWorkspace(c *gin.Context) {
	w, r := c.Writer, c.Request
	p, raw, stored, ok := h.reserve(w, r)
	if !ok {
		return
	}
	if stored != nil {
		httpx.WriteRawJSON(w, 200, stored.Body)
		return
	}
	var body struct {
		Name        string     `json:"name"`
		TeamID      *uuid.UUID `json:"team_id"`
		Description *string    `json:"description"`
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&body) != nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: "invalid workspace"})
		return
	}
	item, e := h.service.CreateWorkspace(r.Context(), body.Name, body.TeamID, body.Description)
	if e != nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: e.Error()})
		return
	}
	h.complete(w, r, p, item)
}
func (h *Handler) Create(c *gin.Context) {
	w, r := c.Writer, c.Request
	p, raw, stored, ok := h.reserve(w, r)
	if !ok {
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
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: "invalid document"})
		return
	}
	item, e := h.service.Create(r.Context(), c.Param("kind"), request)
	if e != nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: e.Error()})
		return
	}
	h.complete(w, r, p, item)
}
func (h *Handler) Update(c *gin.Context) {
	w, r := c.Writer, c.Request
	id, e := uuid.Parse(c.Param("id"))
	var request UpdateRequest
	if e != nil || json.NewDecoder(r.Body).Decode(&request) != nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: "invalid document update"})
		return
	}
	item, e := h.service.Update(r.Context(), c.Param("kind"), id, request)
	if e != nil {
		httpx.WriteError(w, r, 404, httpx.Error{Code: "NOT_FOUND", Message: "document not found"})
		return
	}
	httpx.Write(w, r, 200, item)
}
