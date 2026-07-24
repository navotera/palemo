package auth

import (
	"encoding/json"
	"github.com/gin-gonic/gin"
	"github.com/npms-platform/npms/internal/platform/httpx"
	"net/http"
	"time"
)

func (h *Handler) SSO(c *gin.Context) {
	w, r := c.Writer, c.Request
	var body struct {
		Token string `json:"token"`
	}
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&body) != nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: "token required"})
		return
	}
	session, e := h.service.SSO(r.Context(), body.Token)
	if e != nil {
		httpx.WriteError(w, r, 401, httpx.Error{Code: "UNAUTHORIZED", Message: e.Error()})
		return
	}
	http.SetCookie(w, &http.Cookie{Name: SessionCookieName, Value: session.Token, Path: "/", HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: r.TLS != nil, Expires: time.Unix(session.ExpiresAt, 0)})
	httpx.Write(w, r, 200, map[string]any{"user": session.User, "expires_at": session.ExpiresAt})
}
