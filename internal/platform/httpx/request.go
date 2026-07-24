package httpx

import (
	"context"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type requestIDKey struct{}

func RequestIDMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		requestID := c.GetHeader("X-Request-ID")
		if _, err := uuid.Parse(requestID); err != nil {
			requestID = uuid.NewString()
		}
		c.Header("X-Request-ID", requestID)
		c.Request = c.Request.WithContext(context.WithValue(c.Request.Context(), requestIDKey{}, requestID))
		c.Next()
	}
}

func RequestID(ctx context.Context) string {
	requestID, _ := ctx.Value(requestIDKey{}).(string)
	return requestID
}
