package clientauth

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
	service *Service
	idem    *idempotency.UserService
}

func NewHandler(service *Service, idem *idempotency.UserService) *Handler {
	return &Handler{service: service, idem: idem}
}
func (h *Handler) Token(c *gin.Context) {
	w, r := c.Writer, c.Request
	var body struct {
		ClientID     string `json:"client_id"`
		ClientSecret string `json:"client_secret"`
		GrantType    string `json:"grant_type"`
	}
	if json.NewDecoder(r.Body).Decode(&body) != nil || body.GrantType != "client_credentials" {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: "client_credentials grant required"})
		return
	}
	token, expires, e := h.service.Token(r.Context(), body.ClientID, body.ClientSecret)
	if e != nil {
		httpx.WriteError(w, r, 401, httpx.Error{Code: "UNAUTHORIZED", Message: "invalid client credentials"})
		return
	}
	httpx.Write(w, r, 200, map[string]any{"access_token": token, "token_type": "Bearer", "expires_at": expires})
}
func (h *Handler) List(c *gin.Context) {
	w, r := c.Writer, c.Request
	items, e := h.service.List(r.Context())
	if e != nil {
		httpx.WriteError(w, r, 500, httpx.Error{Code: "INTERNAL_ERROR", Message: "could not list API clients"})
		return
	}
	httpx.Write(w, r, 200, items)
}
func (h *Handler) Register(c *gin.Context) {
	w, r := c.Writer, c.Request
	p, e := tenant.PrincipalFrom(r.Context())
	if e != nil || p.ActorID == nil {
		httpx.WriteError(w, r, 401, httpx.Error{Code: "UNAUTHORIZED", Message: "user session required"})
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
	var body struct {
		Name   string   `json:"name"`
		Scopes []string `json:"scopes"`
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&body) != nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: "invalid API client"})
		return
	}
	item, e := h.service.Register(r.Context(), strings.TrimSpace(body.Name), body.Scopes)
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
