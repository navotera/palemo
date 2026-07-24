package clientauth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
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

var ErrUnauthorized = errors.New("invalid client credentials")

type Client struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	ClientID  string    `json:"client_id"`
	Scopes    PGStrings `json:"scopes"`
	Active    bool      `json:"is_active"`
	RateLimit int       `json:"rate_limit_per_minute"`
	CreatedAt time.Time `json:"created_at"`
}
type Registration struct {
	Client
	ClientSecret string `json:"client_secret"`
}
type claims struct {
	TenantID  string   `json:"tenant_id"`
	ClientID  string   `json:"client_id"`
	Scopes    []string `json:"scopes"`
	RateLimit int      `json:"rate_limit"`
	jwt.RegisteredClaims
}
type Service struct {
	db     *gorm.DB
	secret []byte
	audit  *audit.Service
}

func NewService(db *gorm.DB, secret string) *Service {
	return &Service{db: db, secret: []byte(secret), audit: audit.NewService()}
}
func hash(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}
func randomSecret() (string, error) {
	raw := make([]byte, 32)
	if _, e := rand.Read(raw); e != nil {
		return "", e
	}
	return hex.EncodeToString(raw), nil
}
func (s *Service) List(ctx context.Context) ([]Client, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil {
		return nil, e
	}
	rows, e := database.Rows(s.db, ctx, `SELECT id,name,client_id,scopes,is_active,rate_limit_per_minute,created_at FROM api_clients WHERE tenant_id=$1 ORDER BY created_at DESC`, p.TenantID)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []Client{}
	for rows.Next() {
		var c Client
		if e = rows.Scan(&c.ID, &c.Name, &c.ClientID, &c.Scopes, &c.Active, &c.RateLimit, &c.CreatedAt); e != nil {
			return nil, e
		}
		out = append(out, c)
	}
	return out, rows.Err()
}
func (s *Service) Register(ctx context.Context, name string, scopes []string) (Registration, error) {
	p, e := tenant.PrincipalFrom(ctx)
	if e != nil || p.ActorID == nil {
		return Registration{}, fmt.Errorf("user session required")
	}
	if name == "" {
		return Registration{}, fmt.Errorf("name required")
	}
	secret, e := randomSecret()
	if e != nil {
		return Registration{}, e
	}
	clientID := "npms_" + uuid.NewString()
	tx, e := database.Begin(s.db, ctx)
	if e != nil {
		return Registration{}, e
	}
	defer database.Rollback(tx)
	var c Client
	e = database.Row(tx, ctx, `INSERT INTO api_clients(tenant_id,name,client_id,client_secret_hash,scopes) VALUES($1,$2,$3,$4,$5) RETURNING id,name,client_id,scopes,is_active,rate_limit_per_minute,created_at`, p.TenantID, name, clientID, hash(secret), scopes).Scan(&c.ID, &c.Name, &c.ClientID, &c.Scopes, &c.Active, &c.RateLimit, &c.CreatedAt)
	if e != nil {
		return Registration{}, e
	}
	if e = s.audit.Record(ctx, tx, audit.Event{TenantID: p.TenantID, ActorID: p.ActorID, ActorSource: p.Source, Action: "create", EntityType: "api_client", EntityID: c.ID, After: c}); e != nil {
		return Registration{}, e
	}
	if e = database.Commit(tx); e != nil {
		return Registration{}, e
	}
	return Registration{Client: c, ClientSecret: secret}, nil
}
func (s *Service) Token(ctx context.Context, clientID, secret string) (string, int64, error) {
	var id, tenantID uuid.UUID
	var stored string
	var scopes PGStrings
	var active bool
	var limit int
	e := database.Row(s.db, ctx, `SELECT id,tenant_id,client_secret_hash,scopes,is_active,rate_limit_per_minute FROM api_clients WHERE client_id=$1`, clientID).Scan(&id, &tenantID, &stored, &scopes, &active, &limit)
	if e != nil || !active || stored != hash(secret) {
		return "", 0, ErrUnauthorized
	}
	now := time.Now()
	expires := now.Add(time.Hour)
	value := claims{TenantID: tenantID.String(), ClientID: id.String(), Scopes: []string(scopes), RateLimit: limit, RegisteredClaims: jwt.RegisteredClaims{Issuer: "npms", Subject: id.String(), Audience: jwt.ClaimStrings{"npms-api"}, IssuedAt: jwt.NewNumericDate(now), ExpiresAt: jwt.NewNumericDate(expires), ID: uuid.NewString()}}
	token, e := jwt.NewWithClaims(jwt.SigningMethodHS256, value).SignedString(s.secret)
	if e != nil {
		return "", 0, e
	}
	_, _ = database.Exec(s.db, ctx, `UPDATE api_clients SET last_used_at=now() WHERE id=$1`, id)
	return token, expires.Unix(), nil
}
func (s *Service) Parse(tokenValue string) (tenant.Principal, int, error) {
	value := &claims{}
	parsed, e := jwt.ParseWithClaims(tokenValue, value, func(token *jwt.Token) (any, error) {
		if token.Method != jwt.SigningMethodHS256 {
			return nil, ErrUnauthorized
		}
		return s.secret, nil
	}, jwt.WithExpirationRequired(), jwt.WithAudience("npms-api"))
	if e != nil || !parsed.Valid {
		return tenant.Principal{}, 0, ErrUnauthorized
	}
	tenantID, e := uuid.Parse(value.TenantID)
	if e != nil {
		return tenant.Principal{}, 0, ErrUnauthorized
	}
	clientID, e := uuid.Parse(value.ClientID)
	if e != nil {
		return tenant.Principal{}, 0, ErrUnauthorized
	}
	scopes := map[string]struct{}{}
	for _, scope := range value.Scopes {
		scopes[scope] = struct{}{}
	}
	return tenant.Principal{TenantID: tenantID, APIClientID: &clientID, Source: "api:" + clientID.String(), Scopes: scopes}, value.RateLimit, nil
}
