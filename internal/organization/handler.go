package organization

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

func NewHandler(s *Service, i *idempotency.PrincipalService) *Handler {
	return &Handler{service: s, idem: i}
}

// @Summary List divisions
// @Tags organization
// @Router /api/v1/divisions [get]
func (h *Handler) List(c *gin.Context) {
	w, r := c.Writer, c.Request
	items, e := h.service.List(r.Context())
	if e != nil {
		httpx.WriteError(w, r, 500, httpx.Error{Code: "INTERNAL_ERROR", Message: "could not list divisions"})
		return
	}
	httpx.Write(w, r, 200, items)
}

// @Summary Create division
// @Tags organization
// @Param Idempotency-Key header string true "Idempotency key"
// @Router /api/v1/divisions [post]
func (h *Handler) Create(c *gin.Context) {
	w, r := c.Writer, c.Request
	p, e := tenant.PrincipalFrom(r.Context())
	if e != nil {
		httpx.WriteError(w, r, 401, httpx.Error{Code: "UNAUTHORIZED", Message: "sign in required"})
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
	var q CreateRequest
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if e = decoder.Decode(&q); e != nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: "invalid division payload"})
		return
	}
	item, e := h.service.Create(r.Context(), q)
	if e != nil {
		status := 400
		code := "VALIDATION_ERROR"
		if strings.Contains(e.Error(), "role required") {
			status = 403
			code = "FORBIDDEN"
		}
		httpx.WriteError(w, r, status, httpx.Error{Code: code, Message: e.Error()})
		return
	}
	body, _ := httpx.MarshalResponse(r, item)
	if e = h.idem.Complete(r.Context(), p, key, idempotency.StoredResponse{Status: 201, Body: body}); e != nil {
		httpx.WriteError(w, r, 500, httpx.Error{Code: "INTERNAL_ERROR", Message: "could not save response"})
		return
	}
	httpx.WriteRawJSON(w, 201, body)
}

func (h *Handler) SetLeads(c *gin.Context) {
	id, e := uuid.Parse(c.Param("id"))
	if e != nil {
		httpx.WriteError(c.Writer, c.Request, 400, httpx.Error{Code: "VALIDATION_ERROR", Field: "id", Message: "invalid division id"})
		return
	}
	var q SetLeadsRequest
	decoder := json.NewDecoder(http.MaxBytesReader(c.Writer, c.Request.Body, 1<<20))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&q) != nil {
		httpx.WriteError(c.Writer, c.Request, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: "invalid lead payload"})
		return
	}
	item, e := h.service.SetLeads(c.Request.Context(), id, q)
	if e != nil {
		status, code := 400, "VALIDATION_ERROR"
		if strings.Contains(e.Error(), "role required") {
			status, code = 403, "FORBIDDEN"
		}
		httpx.WriteError(c.Writer, c.Request, status, httpx.Error{Code: code, Message: e.Error()})
		return
	}
	httpx.Write(c.Writer, c.Request, 200, item)
}
