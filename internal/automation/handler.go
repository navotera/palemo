package automation

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
func (h *Handler) List(c *gin.Context) {
	w, r := c.Writer, c.Request
	items, e := h.service.List(r.Context())
	if e != nil {
		httpx.WriteError(w, r, 500, httpx.Error{Code: "INTERNAL_ERROR", Message: "could not list rules"})
		return
	}
	httpx.Write(w, r, 200, items)
}
func (h *Handler) Create(c *gin.Context) {
	w, r := c.Writer, c.Request
	p, e := tenant.PrincipalFrom(r.Context())
	if e != nil {
		httpx.WriteError(w, r, 401, httpx.Error{Code: "UNAUTHORIZED", Message: "authentication required"})
		return
	}
	key := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	raw, _ := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20))
	if key == "" {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Field: "Idempotency-Key", Message: "required"})
		return
	}
	stored, e := h.idem.Reserve(r.Context(), p, key, idempotency.RequestHash(raw))
	if errors.Is(e, idempotency.ErrPayloadConflict) {
		httpx.WriteError(w, r, 409, httpx.Error{Code: "CONFLICT", Message: "payload conflict"})
		return
	}
	if e != nil {
		httpx.WriteError(w, r, 500, httpx.Error{Code: "INTERNAL_ERROR", Message: "reservation failed"})
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
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: "invalid rule"})
		return
	}
	item, e := h.service.Create(r.Context(), request)
	if e != nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: e.Error()})
		return
	}
	response, _ := httpx.MarshalResponse(r, item)
	if h.idem.Complete(r.Context(), p, key, idempotency.StoredResponse{Status: 201, Body: response}) != nil {
		httpx.WriteError(w, r, 500, httpx.Error{Code: "INTERNAL_ERROR", Message: "completion failed"})
		return
	}
	httpx.WriteRawJSON(w, 201, response)
}
func (h *Handler) SetActive(c *gin.Context) {
	w, r := c.Writer, c.Request
	id, e := uuid.Parse(c.Param("id"))
	var body struct {
		Active bool `json:"is_active"`
	}
	if e != nil || json.NewDecoder(r.Body).Decode(&body) != nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: "invalid update"})
		return
	}
	item, e := h.service.SetActive(r.Context(), id, body.Active)
	if e != nil {
		httpx.WriteError(w, r, 404, httpx.Error{Code: "NOT_FOUND", Message: "rule not found"})
		return
	}
	httpx.Write(w, r, 200, item)
}
