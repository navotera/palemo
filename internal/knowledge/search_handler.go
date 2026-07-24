package knowledge

import (
	"github.com/gin-gonic/gin"
	"github.com/npms-platform/npms/internal/platform/httpx"
)

func (h *Handler) Search(c *gin.Context) {
	w, r := c.Writer, c.Request
	items, e := h.service.Search(r.Context(), r.URL.Query().Get("q"), r.URL.Query().Get("type"))
	if e != nil {
		httpx.WriteError(w, r, 400, httpx.Error{Code: "VALIDATION_ERROR", Message: e.Error()})
		return
	}
	httpx.Write(w, r, 200, items)
}
