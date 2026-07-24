package clientauth

import (
	"github.com/gin-gonic/gin"
	"github.com/npms-platform/npms/internal/platform/database"
	"github.com/npms-platform/npms/internal/platform/httpx"
	"github.com/npms-platform/npms/internal/tenant"
	"net/http"
)

type Usage struct {
	ClientID          string  `json:"client_id"`
	Name              string  `json:"name"`
	Requests          int64   `json:"requests"`
	Errors            int64   `json:"errors"`
	AverageDurationMS float64 `json:"average_duration_ms"`
}

func (s *Service) Usage(r *http.Request) ([]Usage, error) {
	p, e := tenant.PrincipalFrom(r.Context())
	if e != nil || p.ActorID == nil {
		return nil, ErrUnauthorized
	}
	rows, e := database.Rows(s.db, r.Context(), `SELECT c.client_id,c.name,count(u.id),count(u.id)FILTER(WHERE u.status_code>=400),COALESCE(avg(u.duration_ms),0) FROM api_clients c LEFT JOIN api_usage_events u ON u.api_client_id=c.id WHERE c.tenant_id=$1 GROUP BY c.id ORDER BY count(u.id) DESC`, p.TenantID)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []Usage{}
	for rows.Next() {
		var item Usage
		if e = rows.Scan(&item.ClientID, &item.Name, &item.Requests, &item.Errors, &item.AverageDurationMS); e != nil {
			return nil, e
		}
		out = append(out, item)
	}
	return out, rows.Err()
}
func (h *Handler) Usage(c *gin.Context) {
	w, r := c.Writer, c.Request
	items, e := h.service.Usage(r)
	if e != nil {
		httpx.WriteError(w, r, 403, httpx.Error{Code: "FORBIDDEN", Message: "user session required"})
		return
	}
	httpx.Write(w, r, 200, items)
}
