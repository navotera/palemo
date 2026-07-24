package clientauth

import (
	"net/http"
	"time"

	"github.com/npms-platform/npms/internal/platform/database"
	"github.com/npms-platform/npms/internal/tenant"
)

func (s *Service) recordUsage(principal tenant.Principal, request *http.Request, status int, duration time.Duration) {
	if principal.APIClientID == nil {
		return
	}
	_, _ = database.Exec(s.db, request.Context(), `INSERT INTO api_usage_events(tenant_id,api_client_id,request_id,method,path,status_code,duration_ms) VALUES($1,$2,NULLIF($3,'')::uuid,$4,$5,$6,$7)`, principal.TenantID, *principal.APIClientID, request.Header.Get("X-Request-ID"), request.Method, request.URL.Path, status, int(duration.Milliseconds()))
}
