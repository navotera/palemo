package routes

import (
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/npms-platform/npms/internal/clientauth"
)

func TestRegisterAllowsTaskAndChecklistRoutesToCoexist(t *testing.T) {
	gin.SetMode(gin.TestMode)
	defer func() {
		if recovered := recover(); recovered != nil {
			t.Fatalf("route registration panicked: %v", recovered)
		}
	}()

	engine := Register(Dependencies{
		Principal: &clientauth.Middleware{},
		OpenAPI:   func(*gin.Context) {},
	})

	want := map[string]bool{
		"PATCH /api/v1/tasks/:taskID":               false,
		"GET /api/v1/tasks/:taskID/checklist":       false,
		"POST /api/v1/tasks/:taskID/checklist":      false,
		"PATCH /api/v1/tasks/:taskID/checklist/:id": false,
	}
	for _, route := range engine.Routes() {
		key := route.Method + " " + route.Path
		if _, tracked := want[key]; tracked {
			want[key] = true
		}
	}
	for route, registered := range want {
		if !registered {
			t.Errorf("expected route %s to be registered", route)
		}
	}
}
