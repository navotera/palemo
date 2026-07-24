package auth

import (
	"context"
	"fmt"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/npms-platform/npms/internal/audit"
	"github.com/npms-platform/npms/internal/platform/database"
	"time"
)

type externalClaims struct {
	ExternalID string `json:"external_id"`
	Name       string `json:"name"`
	Email      string `json:"email"`
	Role       string `json:"role"`
	TenantID   string `json:"tenant_id"`
	TeamID     string `json:"team_id"`
	jwt.RegisteredClaims
}

func (s *Service) SetSSOSecret(secret string) { s.ssoSecret = []byte(secret) }
func (s *Service) SSO(ctx context.Context, token string) (Session, error) {
	if len(s.ssoSecret) < 32 {
		return Session{}, fmt.Errorf("SSO_SHARED_SECRET must contain at least 32 characters")
	}
	claims := &externalClaims{}
	parsed, e := jwt.ParseWithClaims(token, claims, func(t *jwt.Token) (any, error) {
		if t.Method != jwt.SigningMethodHS256 {
			return nil, ErrUnauthorized
		}
		return s.ssoSecret, nil
	}, jwt.WithExpirationRequired(), jwt.WithIssuedAt())
	if e != nil || !parsed.Valid || claims.ExternalID == "" || claims.Email == "" || claims.ExpiresAt == nil {
		return Session{}, ErrUnauthorized
	}
	tenantID, e := uuid.Parse(claims.TenantID)
	if e != nil {
		return Session{}, ErrUnauthorized
	}
	teamID, e := uuid.Parse(claims.TeamID)
	if e != nil {
		return Session{}, ErrUnauthorized
	}
	var role string
	e = database.Row(s.db, ctx, `SELECT npms_role FROM sso_role_mappings WHERE tenant_id=$1 AND external_role=$2`, tenantID, claims.Role).Scan(&role)
	if database.IsNotFound(e) {
		return Session{}, fmt.Errorf("external role is not mapped")
	}
	if e != nil {
		return Session{}, e
	}
	tx, e := database.Begin(s.db, ctx)
	if e != nil {
		return Session{}, e
	}
	defer database.Rollback(tx)
	var user User
	e = database.Row(tx, ctx, `INSERT INTO users(tenant_id,team_id,external_id,name,email,role) SELECT $1,$2,$3,$4,$5,$6 WHERE EXISTS(SELECT 1 FROM teams WHERE tenant_id=$1 AND id=$2) ON CONFLICT(tenant_id,external_id) DO UPDATE SET team_id=EXCLUDED.team_id,name=EXCLUDED.name,email=EXCLUDED.email,role=EXCLUDED.role,updated_at=now() RETURNING id,tenant_id,team_id,name,email,role`, tenantID, teamID, claims.ExternalID, claims.Name, claims.Email, role).Scan(&user.ID, &user.TenantID, &user.TeamID, &user.Name, &user.Email, &user.Role)
	if e != nil {
		return Session{}, ErrUnauthorized
	}
	e = database.Row(tx, ctx, `SELECT t.name,tm.name FROM tenants t JOIN teams tm ON tm.tenant_id=t.id WHERE t.id=$1 AND tm.id=$2`, tenantID, teamID).Scan(&user.Tenant, &user.Team)
	if e != nil {
		return Session{}, e
	}
	if e = s.audit.Record(ctx, tx, audit.Event{TenantID: tenantID, ActorID: &user.ID, ActorSource: "sso", Action: "login", EntityType: "user", EntityID: user.ID, After: map[string]any{"external_id": claims.ExternalID, "role": role}}); e != nil {
		return Session{}, e
	}
	if e = database.Commit(tx); e != nil {
		return Session{}, e
	}
	return s.issueUntil(user, claims.ExpiresAt.Time)
}
func (s *Service) issueUntil(user User, expiresAt time.Time) (Session, error) {
	now := time.Now()
	max := now.Add(8 * time.Hour)
	if expiresAt.After(max) {
		expiresAt = max
	}
	if !expiresAt.After(now) {
		return Session{}, ErrUnauthorized
	}
	claims := sessionClaims{TenantID: user.TenantID.String(), UserID: user.ID.String(), Role: user.Role, Source: "sso", RegisteredClaims: jwt.RegisteredClaims{Issuer: "npms", Subject: user.ID.String(), IssuedAt: jwt.NewNumericDate(now), ExpiresAt: jwt.NewNumericDate(expiresAt), ID: uuid.NewString()}}
	token, e := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(s.secret)
	if e != nil {
		return Session{}, e
	}
	return Session{Token: token, ExpiresAt: expiresAt.Unix(), User: user}, nil
}
