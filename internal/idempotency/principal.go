package idempotency

import (
	"context"
	"fmt"

	"github.com/npms-platform/npms/internal/tenant"
)

type PrincipalService struct {
	users   *UserService
	clients *Service
}

func NewPrincipalService(users *UserService, clients *Service) *PrincipalService {
	return &PrincipalService{users: users, clients: clients}
}
func (s *PrincipalService) Reserve(ctx context.Context, p tenant.Principal, key, requestHash string) (*StoredResponse, error) {
	if p.ActorID != nil {
		return s.users.Reserve(ctx, p.TenantID, *p.ActorID, key, requestHash)
	}
	if p.APIClientID != nil {
		return s.clients.Reserve(ctx, p.TenantID, *p.APIClientID, key, requestHash)
	}
	return nil, fmt.Errorf("authenticated principal required")
}
func (s *PrincipalService) Complete(ctx context.Context, p tenant.Principal, key string, response StoredResponse) error {
	if p.ActorID != nil {
		return s.users.Complete(ctx, p.TenantID, *p.ActorID, key, response)
	}
	if p.APIClientID != nil {
		return s.clients.Complete(ctx, *p.APIClientID, key, response)
	}
	return fmt.Errorf("authenticated principal required")
}
