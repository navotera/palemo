package reports

import (
	"bytes"
	"context"
	"fmt"
	"github.com/gin-gonic/gin"
	"github.com/npms-platform/npms/internal/platform/database"
	"gorm.io/gorm"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/npms-platform/npms/internal/audit"
	"github.com/npms-platform/npms/internal/platform/httpx"
	"github.com/npms-platform/npms/internal/tenant"
)

type Row struct {
	UserID          uuid.UUID `json:"user_id"`
	Name            string    `json:"name"`
	CompletedTasks  int       `json:"completed_tasks"`
	OpenTasks       int       `json:"open_tasks"`
	DurationSeconds int64     `json:"duration_seconds"`
}
type Report struct {
	From   string `json:"from"`
	To     string `json:"to"`
	Rows   []Row  `json:"rows"`
	Totals Row    `json:"totals"`
}
type Service struct {
	db    *gorm.DB
	audit *audit.Service
}

func NewService(db *gorm.DB) *Service { return &Service{db: db, audit: audit.NewService()} }
func (s *Service) Productivity(ctx context.Context, from, to time.Time, teamID *uuid.UUID) (Report, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil {
		return Report{}, e
	}
	args := []any{p.TenantID, from, to}
	teamFilter := ""
	if teamID != nil {
		args = append(args, *teamID)
		teamFilter = " AND u.team_id=$4"
	}
	rows, e := database.Rows(s.db, ctx, `SELECT u.id,u.name,COUNT(DISTINCT t.id) FILTER(WHERE t.board_column='done'),COUNT(DISTINCT t.id) FILTER(WHERE t.board_column<>'done' AND t.deleted_at IS NULL),COALESCE(SUM(te.duration_seconds) FILTER(WHERE te.ended_at IS NOT NULL AND NOT te.auto_closed),0) FROM users u LEFT JOIN tasks t ON t.tenant_id=u.tenant_id AND t.assignee_id=u.id LEFT JOIN time_entries te ON te.tenant_id=u.tenant_id AND te.user_id=u.id AND te.started_at >= $2 AND te.started_at < $3 WHERE u.tenant_id=$1`+teamFilter+` GROUP BY u.id,u.name ORDER BY u.name`, args...)
	if e != nil {
		return Report{}, e
	}
	defer rows.Close()
	report := Report{From: from.Format("2006-01-02"), To: to.Add(-time.Nanosecond).Format("2006-01-02"), Rows: []Row{}}
	for rows.Next() {
		var row Row
		if e = rows.Scan(&row.UserID, &row.Name, &row.CompletedTasks, &row.OpenTasks, &row.DurationSeconds); e != nil {
			return Report{}, e
		}
		report.Rows = append(report.Rows, row)
		report.Totals.CompletedTasks += row.CompletedTasks
		report.Totals.OpenTasks += row.OpenTasks
		report.Totals.DurationSeconds += row.DurationSeconds
	}
	report.Totals.Name = "Total"
	return report, rows.Err()
}
func (s *Service) RecordExport(ctx context.Context, report Report) (uuid.UUID, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil || p.ActorID == nil {
		return uuid.Nil, fmt.Errorf("sign in required")
	}
	tx, e := database.Begin(s.db, ctx)
	if e != nil {
		return uuid.Nil, e
	}
	defer database.Rollback(tx)
	var id uuid.UUID
	e = database.Row(tx, ctx, `INSERT INTO report_exports(tenant_id,requested_by,report_type,filters_json,status,completed_at) VALUES($1,$2,'productivity',jsonb_build_object('from',$3::text,'to',$4::text),'ready',now()) RETURNING id`, p.TenantID, *p.ActorID, report.From, report.To).Scan(&id)
	if e != nil {
		return uuid.Nil, e
	}
	e = s.audit.Record(ctx, tx, audit.Event{TenantID: p.TenantID, ActorID: p.ActorID, ActorSource: p.Source, Action: "create", EntityType: "report_export", EntityID: id, After: map[string]any{"status": "ready", "type": "productivity"}})
	if e != nil {
		return uuid.Nil, e
	}
	return id, database.Commit(tx)
}

type Handler struct{ service *Service }

func NewHandler(s *Service) *Handler { return &Handler{service: s} }
func (h *Handler) Productivity(c *gin.Context) {
	w, r := c.Writer, c.Request
	from, to, e := dateRange(r)
	if e != nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: e.Error()})
		return
	}
	var teamID *uuid.UUID
	if value := r.URL.Query().Get("team_id"); value != "" {
		id, x := uuid.Parse(value)
		if x != nil {
			httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Field: "team_id", Message: "valid team_id required"})
			return
		}
		teamID = &id
	}
	report, e := h.service.Productivity(r.Context(), from, to, teamID)
	if e != nil {
		httpx.WriteError(w, r, 500, httpx.Error{Code: "INTERNAL_ERROR", Message: "could not generate report"})
		return
	}
	if r.URL.Query().Get("format") == "pdf" {
		id, e := h.service.RecordExport(r.Context(), report)
		if e != nil {
			httpx.WriteError(w, r, 500, httpx.Error{Code: "INTERNAL_ERROR", Message: "could not record export"})
			return
		}
		url := fmt.Sprintf("/api/v1/reports/productivity.pdf?from=%s&to=%s&export_id=%s", report.From, report.To, id)
		httpx.Write(w, r, 202, map[string]any{"report_id": id, "status": "ready", "download_url": url})
		return
	}
	httpx.Write(w, r, 200, report)
}
func (h *Handler) PDF(c *gin.Context) {
	w, r := c.Writer, c.Request
	from, to, e := dateRange(r)
	if e != nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: e.Error()})
		return
	}
	report, e := h.service.Productivity(r.Context(), from, to, nil)
	if e != nil {
		httpx.WriteError(w, r, 500, httpx.Error{Code: "INTERNAL_ERROR", Message: "could not generate report"})
		return
	}
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", `attachment; filename="npms-productivity.pdf"`)
	w.Write(SimplePDF(report))
}
func dateRange(r *http.Request) (time.Time, time.Time, error) {
	now := time.Now().UTC()
	from := now.AddDate(0, 0, -30)
	to := now.AddDate(0, 0, 1)
	var e error
	if value := r.URL.Query().Get("from"); value != "" {
		from, e = time.Parse("2006-01-02", value)
		if e != nil {
			return from, to, fmt.Errorf("from must be YYYY-MM-DD")
		}
	}
	if value := r.URL.Query().Get("to"); value != "" {
		to, e = time.Parse("2006-01-02", value)
		if e != nil {
			return from, to, fmt.Errorf("to must be YYYY-MM-DD")
		}
		to = to.AddDate(0, 0, 1)
	}
	if !from.Before(to) {
		return from, to, fmt.Errorf("from must be before to")
	}
	return from, to, nil
}
func esc(s string) string {
	return strings.NewReplacer("\\", "\\\\", "(", "\\(", ")", "\\)").Replace(s)
}
func SimplePDF(report Report) []byte {
	lines := []string{"NPMS Productivity Report", "Period: " + report.From + " to " + report.To, "", "Staff                          Completed   Open   Tracked hours"}
	for _, r := range report.Rows {
		lines = append(lines, fmt.Sprintf("%-30s %9d %6d %14.2f", r.Name, r.CompletedTasks, r.OpenTasks, float64(r.DurationSeconds)/3600))
	}
	lines = append(lines, "", fmt.Sprintf("TOTAL                          %9d %6d %14.2f", report.Totals.CompletedTasks, report.Totals.OpenTasks, float64(report.Totals.DurationSeconds)/3600))
	var stream strings.Builder
	stream.WriteString("BT /F1 18 Tf 54 760 Td (")
	stream.WriteString(esc(lines[0]))
	stream.WriteString(") Tj /F1 10 Tf 0 -24 Td ")
	for _, line := range lines[1:] {
		stream.WriteString("(")
		stream.WriteString(esc(line))
		stream.WriteString(") Tj 0 -16 Td ")
	}
	stream.WriteString("ET")
	objects := []string{"<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>", fmt.Sprintf("<< /Length %d >>\nstream\n%s\nendstream", stream.Len(), stream.String()), "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>"}
	var out bytes.Buffer
	out.WriteString("%PDF-1.4\n")
	offsets := []int{0}
	for i, obj := range objects {
		offsets = append(offsets, out.Len())
		fmt.Fprintf(&out, "%d 0 obj\n%s\nendobj\n", i+1, obj)
	}
	xref := out.Len()
	fmt.Fprintf(&out, "xref\n0 %d\n0000000000 65535 f \n", len(objects)+1)
	for _, offset := range offsets[1:] {
		fmt.Fprintf(&out, "%010d 00000 n \n", offset)
	}
	fmt.Fprintf(&out, "trailer << /Size %d /Root 1 0 R >>\nstartxref\n%s\n%%%%EOF", len(objects)+1, strconv.Itoa(xref))
	return out.Bytes()
}
