package tenant

import (
	"context"
	"fmt"

	"github.com/google/uuid"
)

type contextKey struct{}

type Principal struct {
	TenantID    uuid.UUID
	ActorID     *uuid.UUID
	Source      string
	APIClientID *uuid.UUID
	Scopes      map[string]struct{}
}

func WithPrincipal(ctx context.Context, principal Principal) context.Context {
	return context.WithValue(ctx, contextKey{}, principal)
}

func PrincipalFrom(ctx context.Context) (Principal, error) {
	principal, ok := ctx.Value(contextKey{}).(Principal)
	if !ok || principal.TenantID == uuid.Nil || principal.Source == "" {
		return Principal{}, fmt.Errorf("tenant principal missing from context")
	}
	return principal, nil
}

func (p Principal) HasScope(scope string) bool {
	_, ok := p.Scopes[scope]
	return ok
}
