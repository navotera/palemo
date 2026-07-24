package httpx

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestResponseEnvelopeIncludesRequestID(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(RequestIDMiddleware())
	router.GET("/health/live", func(c *gin.Context) {
		Write(c.Writer, c.Request, http.StatusOK, map[string]string{"status": "ok"})
	})

	request := httptest.NewRequest(http.MethodGet, "/health/live", nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", response.Code)
	}
	var body Envelope
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.Meta.RequestID == "" {
		t.Fatal("expected request_id in response envelope")
	}
	if body.Errors != nil {
		t.Fatalf("expected errors to be null, got %#v", body.Errors)
	}
}
