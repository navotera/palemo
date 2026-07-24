package dashboard

import (
	"context"

	"github.com/npms-platform/npms/internal/tenant"
)

type Service struct{ repository *Repository }

func NewService(repository *Repository) *Service { return &Service{repository: repository} }

func (s *Service) Summary(ctx context.Context) (Summary, error) {
	principal, err := tenant.PrincipalFrom(ctx)
	if err != nil {
		return Summary{}, err
	}
	return s.repository.Summary(ctx, principal.TenantID)
}
