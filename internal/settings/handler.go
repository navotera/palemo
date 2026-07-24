package settings

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/npms-platform/npms/internal/idempotency"
	"github.com/npms-platform/npms/internal/platform/httpx"
	"github.com/npms-platform/npms/internal/tenant"
)

type Handler struct {
	service *Service
	idem    *idempotency.PrincipalService
}

func NewHandler(service *Service, idem *idempotency.PrincipalService) *Handler {
	return &Handler{service: service, idem: idem}
}

func (h *Handler) ProjectTypes(c *gin.Context) {
	items, err := h.service.ProjectTypes(c.Request.Context())
	if err != nil {
		httpx.WriteError(c.Writer, c.Request, 500, httpx.Error{Code: "INTERNAL_ERROR", Message: "could not list project types"})
		return
	}
	httpx.Write(c.Writer, c.Request, 200, items)
}
func (h *Handler) MetadataFields(c *gin.Context) {
	items, err := h.service.MetadataFields(c.Request.Context())
	if err != nil {
		httpx.WriteError(c.Writer, c.Request, 500, httpx.Error{Code: "INTERNAL_ERROR", Message: "could not list metadata fields"})
		return
	}
	httpx.Write(c.Writer, c.Request, 200, items)
}

func create[T any, R any](c *gin.Context, idem *idempotency.PrincipalService, run func(contextRequest T) (R, error)) {
	w, r := c.Writer, c.Request
	p, err := tenant.PrincipalFrom(r.Context())
	if err != nil {
		httpx.WriteError(w, r, 401, httpx.Error{Code: "UNAUTHORIZED", Message: "sign in required"})
		return
	}
	key := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	raw, readErr := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20))
	if readErr != nil || key == "" {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Field: "Idempotency-Key", Message: "Idempotency-Key is required"})
		return
	}
	stored, err := idem.Reserve(r.Context(), p, key, idempotency.RequestHash(raw))
	if errors.Is(err, idempotency.ErrPayloadConflict) {
		httpx.WriteError(w, r, 409, httpx.Error{Code: "CONFLICT", Message: "idempotency key payload conflict"})
		return
	}
	if err != nil {
		httpx.WriteError(w, r, 500, httpx.Error{Code: "INTERNAL_ERROR", Message: "could not reserve request"})
		return
	}
	if stored != nil {
		httpx.WriteRawJSON(w, 200, stored.Body)
		return
	}
	var q T
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&q) != nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: "invalid settings payload"})
		return
	}
	item, err := run(q)
	if err != nil {
		status, code := 400, "VALIDATION_ERROR"
		if strings.Contains(err.Error(), "role required") {
			status, code = 403, "FORBIDDEN"
		}
		httpx.WriteError(w, r, status, httpx.Error{Code: code, Message: err.Error()})
		return
	}
	body, err := httpx.MarshalResponse(r, item)
	if err != nil || idem.Complete(r.Context(), p, key, idempotency.StoredResponse{Status: 201, Body: body}) != nil {
		httpx.WriteError(w, r, 500, httpx.Error{Code: "INTERNAL_ERROR", Message: "could not persist response"})
		return
	}
	httpx.WriteRawJSON(w, 201, body)
}

func (h *Handler) CreateProjectType(c *gin.Context) {
	create(c, h.idem, func(q CreateProjectTypeRequest) (ProjectType, error) {
		return h.service.CreateProjectType(c.Request.Context(), q)
	})
}
func (h *Handler) CreateMetadataField(c *gin.Context) {
	create(c, h.idem, func(q CreateMetadataFieldRequest) (MetadataField, error) {
		return h.service.CreateMetadataField(c.Request.Context(), q)
	})
}
func (h *Handler) CreateUser(c *gin.Context) {
	create(c, h.idem, func(q CreateUserRequest) (DirectoryUser, error) { return h.service.CreateUser(c.Request.Context(), q) })
}
