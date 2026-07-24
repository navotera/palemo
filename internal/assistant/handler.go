package assistant

import (
	"bytes"
	"encoding/json"
	"errors"
	"github.com/gin-gonic/gin"
	"github.com/npms-platform/npms/internal/idempotency"
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
func (h *Handler) History(c *gin.Context) {
	w, r := c.Writer, c.Request
	items, e := h.service.History(r.Context())
	if e != nil {
		httpx.WriteError(w, r, 403, httpx.Error{Code: "FORBIDDEN", Message: e.Error()})
		return
	}
	httpx.Write(w, r, 200, items)
}
func (h *Handler) Query(c *gin.Context) {
	w, r := c.Writer, c.Request
	p, e := tenant.PrincipalFrom(r.Context())
	if e != nil || p.ActorID == nil {
		httpx.WriteError(w, r, 401, httpx.Error{Code: "UNAUTHORIZED", Message: "user session required"})
		return
	}
	key := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	raw, _ := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20))
	if key == "" {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Field: "Idempotency-Key", Message: "required"})
		return
	}
	stored, e := h.idem.Reserve(r.Context(), p.TenantID, *p.ActorID, key, idempotency.RequestHash(raw))
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
	var body struct {
		Question string `json:"question"`
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&body) != nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: "invalid query"})
		return
	}
	item, e := h.service.Query(r.Context(), body.Question)
	if e != nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: e.Error()})
		return
	}
	response, _ := httpx.MarshalResponse(r, item)
	if h.idem.Complete(r.Context(), p.TenantID, *p.ActorID, key, idempotency.StoredResponse{Status: 201, Body: response}) != nil {
		httpx.WriteError(w, r, 500, httpx.Error{Code: "INTERNAL_ERROR", Message: "completion failed"})
		return
	}
	httpx.WriteRawJSON(w, 201, response)
}
