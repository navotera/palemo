package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/npms-platform/npms/internal/platform/httpx"
)

func Recovery() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if recover() != nil {
				httpx.WriteError(c.Writer, c.Request, http.StatusInternalServerError, httpx.Error{Code: "INTERNAL_ERROR", Message: "an unexpected error occurred"})
				c.Abort()
			}
		}()
		c.Next()
	}
}
