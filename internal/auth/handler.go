package auth

import (
	"errors"
	"github.com/gin-gonic/gin"
	"net/http"
	"time"

	"github.com/npms-platform/npms/internal/platform/httpx"
	"github.com/npms-platform/npms/internal/tenant"
)

type Handler struct{ service *Service }

func NewHandler(service *Service) *Handler { return &Handler{service: service} }

func (h *Handler) DevelopmentSession(c *gin.Context) {
	w, r := c.Writer, c.Request
	session, err := h.service.DevelopmentSession(r.Context())
	if errors.Is(err, ErrDevDisabled) {
		httpx.WriteError(w, r, http.StatusNotFound, httpx.Error{Code: "NOT_FOUND", Message: "resource not found"})
		return
	}
	if err != nil {
		httpx.WriteError(w, r, http.StatusInternalServerError, httpx.Error{Code: "INTERNAL_ERROR", Message: "could not create development session"})
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name: SessionCookieName, Value: session.Token, Path: "/", HttpOnly: true,
		SameSite: http.SameSiteLaxMode, Secure: r.TLS != nil, Expires: time.Unix(session.ExpiresAt, 0),
	})
	httpx.Write(w, r, http.StatusOK, map[string]any{"user": session.User, "expires_at": session.ExpiresAt})
}

func (h *Handler) CurrentUser(c *gin.Context) {
	w, r := c.Writer, c.Request
	principal, err := tenant.PrincipalFrom(r.Context())
	if err != nil {
		httpx.WriteError(w, r, http.StatusUnauthorized, httpx.Error{Code: "UNAUTHORIZED", Message: "sign in required"})
		return
	}
	user, err := h.service.CurrentUser(r.Context(), principal)
	if err != nil {
		httpx.WriteError(w, r, http.StatusUnauthorized, httpx.Error{Code: "UNAUTHORIZED", Message: "session is invalid"})
		return
	}
	httpx.Write(w, r, http.StatusOK, user)
}

func (h *Handler) Logout(c *gin.Context) {
	w, r := c.Writer, c.Request
	http.SetCookie(w, &http.Cookie{Name: SessionCookieName, Value: "", Path: "/", HttpOnly: true, MaxAge: -1})
	httpx.Write(w, r, http.StatusOK, map[string]bool{"signed_out": true})
}
