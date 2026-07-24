package tenant

import (
	"context"
	"testing"

	"github.com/google/uuid"
)

func TestPrincipalFromRejectsMissingTenantContext(t *testing.T) {
	if _, err := PrincipalFrom(context.Background()); err == nil {
		t.Fatal("expected missing tenant context to be rejected")
	}
}

func TestPrincipalScopesAreExplicit(t *testing.T) {
	principal := Principal{
		TenantID: uuid.New(),
		Source:   "api:test-client",
		Scopes:   map[string]struct{}{"projects:write": {}},
	}
	ctx := WithPrincipal(context.Background(), principal)
	stored, err := PrincipalFrom(ctx)
	if err != nil {
		t.Fatalf("read principal: %v", err)
	}
	if !stored.HasScope("projects:write") {
		t.Fatal("expected configured scope")
	}
	if stored.HasScope("reports:read") {
		t.Fatal("unexpected access to unconfigured scope")
	}
}
