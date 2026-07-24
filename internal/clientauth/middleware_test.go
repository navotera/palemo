package clientauth

import (
	"net/http/httptest"
	"testing"
)

func TestScopeFor(t *testing.T) {
	cases := map[string]string{"GET /api/v1/projects": "projects:read", "POST /api/v1/projects": "projects:write", "GET /api/v1/reports/productivity": "reports:read", "POST /api/v1/webhooks/subscriptions": "webhooks:manage"}
	for input, want := range cases {
		methodPath := []byte(input)
		split := 0
		for i, b := range methodPath {
			if b == ' ' {
				split = i
				break
			}
		}
		request := httptest.NewRequest(string(methodPath[:split]), string(methodPath[split+1:]), nil)
		if got := scopeFor(request); got != want {
			t.Fatalf("%s: got %q want %q", input, got, want)
		}
	}
}
