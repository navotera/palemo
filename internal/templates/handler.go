package templates

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
	s    *Service
	idem *idempotency.PrincipalService
}

func NewHandler(s *Service, i *idempotency.PrincipalService) *Handler { return &Handler{s: s, idem: i} }
func (h *Handler) List(c *gin.Context) {
	w, r := c.Writer, c.Request
	v, e := h.s.List(r.Context())
	if e != nil {
		httpx.WriteError(w, r, 500, httpx.Error{Code: "INTERNAL_ERROR", Message: e.Error()})
		return
	}
	httpx.Write(w, r, 200, v)
}
func (h *Handler) Marketplace(c *gin.Context) {
	w, r := c.Writer, c.Request
	v, e := h.s.Marketplace(r.Context())
	if e != nil {
		httpx.WriteError(w, r, 500, httpx.Error{Code: "INTERNAL_ERROR", Message: e.Error()})
		return
	}
	httpx.Write(w, r, 200, v)
}
func (h *Handler) mutate(w http.ResponseWriter, r *http.Request, fn func([]byte) (any, error)) {
	p, e := tenant.PrincipalFrom(r.Context())
	if e != nil {
		httpx.WriteError(w, r, 401, httpx.Error{Code: "UNAUTHORIZED", Message: e.Error()})
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
		httpx.WriteError(w, r, 500, httpx.Error{Code: "INTERNAL_ERROR", Message: e.Error()})
		return
	}
	if stored != nil {
		httpx.WriteRawJSON(w, 200, stored.Body)
		return
	}
	v, e := fn(raw)
	if e != nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: e.Error()})
		return
	}
	body, _ := httpx.MarshalResponse(r, v)
	if e = h.idem.Complete(r.Context(), p, key, idempotency.StoredResponse{Status: 201, Body: body}); e != nil {
		httpx.WriteError(w, r, 500, httpx.Error{Code: "INTERNAL_ERROR", Message: e.Error()})
		return
	}
	httpx.WriteRawJSON(w, 201, body)
}
func (h *Handler) Capture(c *gin.Context) {
	w, r := c.Writer, c.Request
	h.mutate(w, r, func(raw []byte) (any, error) {
		var b struct {
			Name      string    `json:"name"`
			ProjectID uuid.UUID `json:"project_id"`
		}
		d := json.NewDecoder(bytes.NewReader(raw))
		d.DisallowUnknownFields()
		if e := d.Decode(&b); e != nil {
			return nil, e
		}
		return h.s.Capture(r.Context(), b.Name, b.ProjectID)
	})
}
func (h *Handler) Publish(c *gin.Context) {
	w, r := c.Writer, c.Request
	h.mutate(w, r, func(raw []byte) (any, error) {
		var b struct {
			TemplateID  uuid.UUID  `json:"template_id"`
			DivisionID  *uuid.UUID `json:"division_id"`
			Description string     `json:"description"`
		}
		d := json.NewDecoder(bytes.NewReader(raw))
		d.DisallowUnknownFields()
		if e := d.Decode(&b); e != nil {
			return nil, e
		}
		return h.s.Publish(r.Context(), b.TemplateID, b.DivisionID, b.Description)
	})
}
