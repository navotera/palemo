package projects

import (
	"errors"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/npms-platform/npms/internal/idempotency"
	"github.com/npms-platform/npms/internal/platform/httpx"
	"github.com/npms-platform/npms/internal/tenant"
	"io"
	"net/http"
	"strconv"
	"strings"
)

func (h *Handler) FinishAttachments(c *gin.Context) {
	w, r := c.Writer, c.Request
	id, e := projectID(c)
	if e != nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: "invalid project id"})
		return
	}
	items, e := h.service.ListFinishAttachments(r.Context(), id)
	if e != nil {
		httpx.WriteError(w, r, 500, httpx.Error{Code: "INTERNAL_ERROR", Message: "could not list finish proofs"})
		return
	}
	httpx.Write(w, r, 200, items)
}
func (h *Handler) UploadFinishAttachment(c *gin.Context) {
	w, r := c.Writer, c.Request
	p, e := tenant.PrincipalFrom(r.Context())
	id, idErr := projectID(c)
	key := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	if e != nil || idErr != nil || key == "" {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: "valid project id and Idempotency-Key required"})
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 11<<20)
	file, header, e := r.FormFile("file")
	if e != nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: "file required"})
		return
	}
	defer file.Close()
	content, e := io.ReadAll(io.LimitReader(file, 10485761))
	if e != nil || len(content) == 0 || len(content) > 10485760 {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: "file must be between 1 byte and 10 MB"})
		return
	}
	contentType := http.DetectContentType(content)
	allowed := map[string]bool{"application/pdf": true, "image/jpeg": true, "image/png": true, "image/webp": true}
	if !allowed[contentType] {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: "only PDF, JPEG, PNG, or WebP files are allowed"})
		return
	}
	hashInput := append([]byte(header.Filename+"|"+contentType+"|"), content...)
	stored, e := h.idempotency.Reserve(r.Context(), p, key, idempotency.RequestHash(hashInput))
	if errors.Is(e, idempotency.ErrPayloadConflict) {
		httpx.WriteError(w, r, 409, httpx.Error{Code: "CONFLICT", Message: "idempotency payload conflict"})
		return
	}
	if e != nil {
		httpx.WriteError(w, r, 500, httpx.Error{Code: "INTERNAL_ERROR", Message: "could not reserve upload"})
		return
	}
	if stored != nil {
		httpx.WriteRawJSON(w, 200, stored.Body)
		return
	}
	item, e := h.service.AddFinishAttachment(r.Context(), id, header.Filename, contentType, content)
	if e != nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: e.Error()})
		return
	}
	body, _ := httpx.MarshalResponse(r, item)
	if e = h.idempotency.Complete(r.Context(), p, key, idempotency.StoredResponse{Status: 201, Body: body}); e != nil {
		httpx.WriteError(w, r, 500, httpx.Error{Code: "INTERNAL_ERROR", Message: "could not persist upload response"})
		return
	}
	httpx.WriteRawJSON(w, 201, body)
}
func (h *Handler) DownloadFinishAttachment(c *gin.Context) {
	w, r := c.Writer, c.Request
	projectIDValue, e := projectID(c)
	attachmentID, parseErr := uuid.Parse(c.Param("attachmentID"))
	if e != nil || parseErr != nil {
		http.NotFound(w, r)
		return
	}
	item, e := h.service.GetFinishAttachment(r.Context(), projectIDValue, attachmentID)
	if e != nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", item.ContentType)
	w.Header().Set("Content-Length", strconv.FormatInt(item.SizeBytes, 10))
	w.Header().Set("Content-Disposition", `inline; filename="`+strings.ReplaceAll(item.Filename, `"`, "")+`"`)
	w.Write(item.Content)
}
