package projects

import (
	"bytes"
	"encoding/json"
	"errors"
	"github.com/gin-gonic/gin"
	"io"
	"net/http"
	"strings"

	"github.com/npms-platform/npms/internal/idempotency"
	"github.com/npms-platform/npms/internal/platform/httpx"
	"github.com/npms-platform/npms/internal/tenant"
)

type Handler struct {
	service     *Service
	idempotency *idempotency.PrincipalService
}

func NewHandler(service *Service, idempotencyService *idempotency.PrincipalService) *Handler {
	return &Handler{service: service, idempotency: idempotencyService}
}

func (h *Handler) List(c *gin.Context) {
	w, r := c.Writer, c.Request
	projects, err := h.service.List(r.Context())
	if err != nil {
		httpx.WriteError(w, r, http.StatusInternalServerError, httpx.Error{Code: "INTERNAL_ERROR", Message: "could not list projects"})
		return
	}
	httpx.Write(w, r, http.StatusOK, projects)
}

func (h *Handler) PreliminaryNoteTemplates(c *gin.Context) {
	w, r := c.Writer, c.Request
	items, err := h.service.PreliminaryNoteTemplates(r.Context())
	if err != nil {
		httpx.WriteError(w, r, http.StatusInternalServerError, httpx.Error{Code: "INTERNAL_ERROR", Message: "could not list preliminary note templates"})
		return
	}
	httpx.Write(w, r, http.StatusOK, items)
}

func (h *Handler) Create(c *gin.Context) {
	w, r := c.Writer, c.Request
	principal, err := tenant.PrincipalFrom(r.Context())
	if err != nil || (principal.ActorID == nil && principal.APIClientID == nil) {
		httpx.WriteError(w, r, http.StatusUnauthorized, httpx.Error{Code: "UNAUTHORIZED", Message: "sign in required"})
		return
	}
	key := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	if key == "" {
		httpx.WriteError(w, r, http.StatusBadRequest, httpx.Error{Code: "VALIDATION_ERROR", Field: "Idempotency-Key", Message: "Idempotency-Key is required"})
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20))
	if err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, httpx.Error{Code: "VALIDATION_ERROR", Message: "invalid request body"})
		return
	}
	stored, err := h.idempotency.Reserve(r.Context(), principal, key, idempotency.RequestHash(body))
	if errors.Is(err, idempotency.ErrPayloadConflict) {
		httpx.WriteError(w, r, http.StatusConflict, httpx.Error{Code: "CONFLICT", Message: "idempotency key was used with a different payload"})
		return
	}
	if err != nil {
		httpx.WriteError(w, r, http.StatusInternalServerError, httpx.Error{Code: "INTERNAL_ERROR", Message: "could not reserve request"})
		return
	}
	if stored != nil {
		httpx.WriteRawJSON(w, http.StatusOK, stored.Body)
		return
	}
	var request CreateRequest
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, httpx.Error{Code: "VALIDATION_ERROR", Message: "invalid project payload"})
		return
	}
	project, err := h.service.Create(r.Context(), request)
	if err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, httpx.Error{Code: "VALIDATION_ERROR", Message: err.Error()})
		return
	}
	responseBody, err := httpx.MarshalResponse(r, project)
	if err != nil || h.idempotency.Complete(r.Context(), principal, key, idempotency.StoredResponse{Status: http.StatusCreated, Body: responseBody}) != nil {
		httpx.WriteError(w, r, http.StatusInternalServerError, httpx.Error{Code: "INTERNAL_ERROR", Message: "could not persist response"})
		return
	}
	httpx.WriteRawJSON(w, http.StatusCreated, responseBody)
}
