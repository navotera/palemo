package auth

import (
	"context"
	"errors"
	"fmt"
	"github.com/npms-platform/npms/internal/platform/database"
	"gorm.io/gorm"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/npms-platform/npms/internal/audit"
	"github.com/npms-platform/npms/internal/tenant"
)

var (
	ErrUnauthorized = errors.New("invalid or expired session")
	ErrDevDisabled  = errors.New("development sign-in is disabled")
)

type sessionClaims struct {
	TenantID string `json:"tenant_id"`
	UserID   string `json:"user_id"`
	Role     string `json:"role"`
	Source   string `json:"source"`
	jwt.RegisteredClaims
}

type Service struct {
	db          *gorm.DB
	environment string
	secret      []byte
	ssoSecret   []byte
	audit       *audit.Service
}

func NewService(db *gorm.DB, environment, secret string) *Service {
	return &Service{db: db, environment: environment, secret: []byte(secret), audit: audit.NewService()}
}

func (s *Service) DevelopmentSession(ctx context.Context) (Session, error) {
	if s.environment != "development" {
		return Session{}, ErrDevDisabled
	}
	user, err := s.findDevelopmentUser(ctx)
	if database.IsNotFound(err) {
		user, err = s.bootstrapDevelopmentUser(ctx)
	}
	if err != nil {
		return Session{}, err
	}
	return s.issue(user)
}

func (s *Service) Parse(token string) (tenant.Principal, error) {
	claims := &sessionClaims{}
	parsed, err := jwt.ParseWithClaims(token, claims, func(token *jwt.Token) (any, error) {
		if token.Method != jwt.SigningMethodHS256 {
			return nil, ErrUnauthorized
		}
		return s.secret, nil
	}, jwt.WithExpirationRequired(), jwt.WithIssuedAt())
	if err != nil || !parsed.Valid {
		return tenant.Principal{}, ErrUnauthorized
	}
	tenantID, err := uuid.Parse(claims.TenantID)
	if err != nil {
		return tenant.Principal{}, ErrUnauthorized
	}
	userID, err := uuid.Parse(claims.UserID)
	if err != nil {
		return tenant.Principal{}, ErrUnauthorized
	}
	return tenant.Principal{TenantID: tenantID, ActorID: &userID, Source: claims.Source}, nil
}

func (s *Service) CurrentUser(ctx context.Context, principal tenant.Principal) (User, error) {
	if principal.ActorID == nil {
		return User{}, ErrUnauthorized
	}
	var user User
	err := database.Row(s.db, ctx, `
		SELECT u.id, u.tenant_id, u.team_id, u.name, u.email, u.role, t.name, tm.name
		FROM users u
		JOIN tenants t ON t.id = u.tenant_id
		JOIN teams tm ON tm.id = u.team_id
		WHERE u.id = $1 AND u.tenant_id = $2`, *principal.ActorID, principal.TenantID,
	).Scan(&user.ID, &user.TenantID, &user.TeamID, &user.Name, &user.Email, &user.Role, &user.Tenant, &user.Team)
	if database.IsNotFound(err) {
		return User{}, ErrUnauthorized
	}
	if err != nil {
		return User{}, fmt.Errorf("query current user: %w", err)
	}
	return user, nil
}

func (s *Service) issue(user User) (Session, error) {
	if len(s.secret) < 32 {
		return Session{}, fmt.Errorf("SESSION_SECRET must contain at least 32 characters")
	}
	now := time.Now()
	expiresAt := now.Add(8 * time.Hour)
	claims := sessionClaims{
		TenantID: user.TenantID.String(), UserID: user.ID.String(), Role: user.Role, Source: "user",
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer: "npms", Subject: user.ID.String(), IssuedAt: jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(expiresAt), ID: uuid.NewString(),
		},
	}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(s.secret)
	if err != nil {
		return Session{}, fmt.Errorf("sign session: %w", err)
	}
	return Session{Token: token, ExpiresAt: expiresAt.Unix(), User: user}, nil
}

func (s *Service) findDevelopmentUser(ctx context.Context) (User, error) {
	var user User
	err := database.Row(s.db, ctx, `
		SELECT u.id, u.tenant_id, u.team_id, u.name, u.email, u.role, t.name, tm.name
		FROM users u JOIN tenants t ON t.id = u.tenant_id JOIN teams tm ON tm.id = u.team_id
		WHERE u.external_id = 'development-admin' LIMIT 1`,
	).Scan(&user.ID, &user.TenantID, &user.TeamID, &user.Name, &user.Email, &user.Role, &user.Tenant, &user.Team)
	return user, err
}

func (s *Service) bootstrapDevelopmentUser(ctx context.Context) (User, error) {
	tx, err := database.Begin(s.db, ctx)
	if err != nil {
		return User{}, fmt.Errorf("begin development bootstrap: %w", err)
	}
	defer database.Rollback(tx)

	user := User{Name: "Development Admin", Email: "admin@npms.local", Role: "admin", Tenant: "NPMS Development", Team: "Core Team"}
	if err := database.Row(tx, ctx, `INSERT INTO tenants (name) VALUES ($1) RETURNING id`, user.Tenant).Scan(&user.TenantID); err != nil {
		return User{}, fmt.Errorf("create development tenant: %w", err)
	}
	var divisionID uuid.UUID
	if err := database.Row(tx, ctx, `INSERT INTO divisions (tenant_id, name) VALUES ($1, 'General') RETURNING id`, user.TenantID).Scan(&divisionID); err != nil {
		return User{}, fmt.Errorf("create development division: %w", err)
	}
	if err := database.Row(tx, ctx, `INSERT INTO teams (tenant_id, division_id, name) VALUES ($1, $2, $3) RETURNING id`, user.TenantID, divisionID, user.Team).Scan(&user.TeamID); err != nil {
		return User{}, fmt.Errorf("create development team: %w", err)
	}
	if err := database.Row(tx, ctx, `
		INSERT INTO users (tenant_id, team_id, external_id, name, email, role)
		VALUES ($1, $2, 'development-admin', $3, $4, $5) RETURNING id`,
		user.TenantID, user.TeamID, user.Name, user.Email, user.Role,
	).Scan(&user.ID); err != nil {
		return User{}, fmt.Errorf("create development admin: %w", err)
	}
	if err := s.audit.Record(ctx, tx, audit.Event{
		TenantID: user.TenantID, ActorSource: "system:development-bootstrap", Action: "create",
		EntityType: "user", EntityID: user.ID, After: user,
	}); err != nil {
		return User{}, err
	}
	if err := database.Commit(tx); err != nil {
		return User{}, fmt.Errorf("commit development bootstrap: %w", err)
	}
	return user, nil
}
