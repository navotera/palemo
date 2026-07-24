package projects

import (
	"github.com/gin-gonic/gin"
	"github.com/npms-platform/npms/internal/platform/httpx"
)

func (h *Handler) Users(c *gin.Context) {
	w, r := c.Writer, c.Request
	items, e := h.service.Users(r.Context())
	if e != nil {
		httpx.WriteError(w, r, 500, httpx.Error{Code: "INTERNAL_ERROR", Message: "could not list users"})
		return
	}
	httpx.Write(w, r, 200, items)
}
func (h *Handler) SubmitReview(c *gin.Context) {
	w, r := c.Writer, c.Request
	id, e := projectID(c)
	if e != nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: "invalid project id"})
		return
	}
	item, e := h.service.SubmitReview(r.Context(), id)
	if e != nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: e.Error()})
		return
	}
	httpx.Write(w, r, 200, item)
}
