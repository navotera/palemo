package auth

import (
	"testing"

	"github.com/google/uuid"
)

func TestIssuedSessionPreservesTenantAndUserIdentity(t *testing.T) {
	service := NewService(nil, "development", "development-session-secret-change-before-production")
	user := User{ID: uuid.New(), TenantID: uuid.New(), Role: "admin"}
	session, err := service.issue(user)
	if err != nil {
		t.Fatalf("issue session: %v", err)
	}
	principal, err := service.Parse(session.Token)
	if err != nil {
		t.Fatalf("parse session: %v", err)
	}
	if principal.TenantID != user.TenantID || principal.ActorID == nil || *principal.ActorID != user.ID {
		t.Fatalf("identity changed in session: %#v", principal)
	}
}

func TestSessionRejectsDifferentSigningSecret(t *testing.T) {
	issuer := NewService(nil, "development", "development-session-secret-change-before-production")
	reader := NewService(nil, "development", "a-different-development-secret-for-session-validation")
	session, err := issuer.issue(User{ID: uuid.New(), TenantID: uuid.New(), Role: "admin"})
	if err != nil {
		t.Fatalf("issue session: %v", err)
	}
	if _, err := reader.Parse(session.Token); err == nil {
		t.Fatal("expected token signed with another secret to be rejected")
	}
}
