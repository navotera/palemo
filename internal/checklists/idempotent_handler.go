package checklists

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

type IdempotentHandler struct {
	service *Service
	idem    *idempotency.PrincipalService
}

func NewIdempotentHandler(service *Service, idem *idempotency.PrincipalService) *IdempotentHandler {
	return &IdempotentHandler{service: service, idem: idem}
}
func (h *IdempotentHandler) Create(c *gin.Context) {
	w, r := c.Writer, c.Request
	p, e := tenant.PrincipalFrom(r.Context())
	if e != nil || (p.ActorID == nil && p.APIClientID == nil) {
		httpx.WriteError(w, r, 401, httpx.Error{Code: "UNAUTHORIZED", Message: "sign in required"})
		return
	}
	taskID, e := uuid.Parse(c.Param("taskID"))
	if e != nil {
		httpx.WriteError(w, r, 404, httpx.Error{Code: "NOT_FOUND", Message: "task not found"})
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
	stored, e := h.idem.Reserve(r.Context(), p, key, idempotency.RequestHash(raw))
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
	var body struct {
		Label string `json:"label"`
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&body) != nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: "invalid checklist item"})
		return
	}
	item, e := h.service.Create(r.Context(), taskID, body.Label)
	if e != nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: e.Error()})
		return
	}
	response, e := httpx.MarshalResponse(r, item)
	if e != nil || h.idem.Complete(r.Context(), p, key, idempotency.StoredResponse{Status: 201, Body: response}) != nil {
		httpx.WriteError(w, r, 500, httpx.Error{Code: "INTERNAL_ERROR", Message: "could not persist response"})
		return
	}
	httpx.WriteRawJSON(w, 201, response)
}
