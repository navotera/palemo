package projects

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestCreateRequiresIdempotencyKeyBeforeProcessing(t *testing.T) {
	gin.SetMode(gin.TestMode)
	handler := &Handler{}
	request := httptest.NewRequest(http.MethodPost, "/api/v1/projects", nil)
	response := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(response)
	context.Request = request
	handler.Create(context)
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("expected auth check before idempotency, got %d", response.Code)
	}
}
