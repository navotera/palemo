package clientauth

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/npms-platform/npms/internal/auth"
	"github.com/npms-platform/npms/internal/platform/httpx"
	"github.com/npms-platform/npms/internal/tenant"
)

type bucket struct {
	window time.Time
	count  int
}

type Middleware struct {
	users   *auth.Service
	clients *Service
	mu      sync.Mutex
	buckets map[string]bucket
}

func NewMiddleware(users *auth.Service, clients *Service) *Middleware {
	return &Middleware{users: users, clients: clients, buckets: map[string]bucket{}}
}

func (m *Middleware) RequirePrincipal(c *gin.Context) {
	r := c.Request
	if cookie, err := r.Cookie(auth.SessionCookieName); err == nil && cookie.Value != "" {
		if principal, parseErr := m.users.Parse(cookie.Value); parseErr == nil {
			c.Request = r.WithContext(tenant.WithPrincipal(r.Context(), principal))
			c.Next()
			return
		}
	}

	header := r.Header.Get("Authorization")
	if !strings.HasPrefix(header, "Bearer ") {
		httpx.WriteError(c.Writer, r, http.StatusUnauthorized, httpx.Error{Code: "UNAUTHORIZED", Message: "authentication required"})
		c.Abort()
		return
	}
	principal, limit, err := m.clients.Parse(strings.TrimSpace(strings.TrimPrefix(header, "Bearer ")))
	if err != nil {
		httpx.WriteError(c.Writer, r, http.StatusUnauthorized, httpx.Error{Code: "UNAUTHORIZED", Message: "invalid bearer token"})
		c.Abort()
		return
	}
	if required := scopeFor(r); required != "" && !principal.HasScope(required) {
		httpx.WriteError(c.Writer, r, http.StatusForbidden, httpx.Error{Code: "FORBIDDEN", Message: fmt.Sprintf("scope %s required", required)})
		c.Abort()
		return
	}
	if !m.allow(c.Writer, principal.Source, limit) {
		httpx.WriteError(c.Writer, r, http.StatusTooManyRequests, httpx.Error{Code: "RATE_LIMITED", Message: "request rate limit exceeded"})
		c.Abort()
		return
	}

	started := time.Now()
	c.Request = r.WithContext(tenant.WithPrincipal(r.Context(), principal))
	c.Next()
	m.clients.recordUsage(principal, c.Request, c.Writer.Status(), time.Since(started))
}

func scopeFor(r *http.Request) string {
	path := r.URL.Path
	if strings.Contains(path, "/knowledge/") {
		if r.Method == http.MethodGet {
			return "knowledge:read"
		}
		return "knowledge:write"
	}
	if strings.Contains(path, "/integrations/") {
		return "integrations:manage"
	}
	if strings.Contains(path, "/reports/") {
		return "reports:read"
	}
	if strings.Contains(path, "/webhooks/") {
		return "webhooks:manage"
	}
	if strings.Contains(path, "/notifications") {
		if r.Method == http.MethodGet {
			return "notifications:read"
		}
		return "notifications:write"
	}
	if strings.Contains(path, "/projects") {
		if r.Method == http.MethodGet {
			return "projects:read"
		}
		return "projects:write"
	}
	if strings.Contains(path, "/tasks") || strings.Contains(path, "/time-entries") {
		if r.Method == http.MethodGet {
			return "tasks:read"
		}
		return "tasks:write"
	}
	return ""
}

func (m *Middleware) allow(w http.ResponseWriter, key string, limit int) bool {
	if limit <= 0 {
		limit = 120
	}
	window := time.Now().Truncate(time.Minute)
	m.mu.Lock()
	defer m.mu.Unlock()
	item := m.buckets[key]
	if item.window != window {
		item = bucket{window: window}
	}
	w.Header().Set("X-RateLimit-Limit", strconv.Itoa(limit))
	w.Header().Set("X-RateLimit-Reset", strconv.FormatInt(window.Add(time.Minute).Unix(), 10))
	if item.count >= limit {
		w.Header().Set("X-RateLimit-Remaining", "0")
		m.buckets[key] = item
		return false
	}
	item.count++
	m.buckets[key] = item
	w.Header().Set("X-RateLimit-Remaining", strconv.Itoa(limit-item.count))
	return true
}
