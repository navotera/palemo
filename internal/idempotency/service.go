package idempotency

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/npms-platform/npms/internal/platform/database"
	"gorm.io/gorm"

	"github.com/google/uuid"
)

var ErrPayloadConflict = errors.New("idempotency key already used with a different payload")

type StoredResponse struct {
	Status int
	Body   json.RawMessage
}

type Service struct{ db *gorm.DB }

func NewService(db *gorm.DB) *Service { return &Service{db: db} }

func RequestHash(payload []byte) string {
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:])
}

func (s *Service) Reserve(ctx context.Context, tenantID, clientID uuid.UUID, key, requestHash string) (*StoredResponse, error) {
	if key == "" {
		return nil, fmt.Errorf("idempotency key is required")
	}
	var storedHash string
	var status database.NullInt32
	var body []byte
	err := database.Row(s.db, ctx, `
		INSERT INTO idempotency_keys (key, api_client_id, tenant_id, request_hash)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (api_client_id, key) DO UPDATE SET key = EXCLUDED.key
		RETURNING request_hash, response_status, response_snapshot_json`,
		key, clientID, tenantID, requestHash,
	).Scan(&storedHash, &status, &body)
	if err != nil {
		return nil, fmt.Errorf("reserve idempotency key: %w", err)
	}
	if storedHash != requestHash {
		return nil, ErrPayloadConflict
	}
	if status.Valid && len(body) > 0 {
		return &StoredResponse{Status: int(status.Int32), Body: body}, nil
	}
	return nil, nil
}

func (s *Service) Complete(ctx context.Context, clientID uuid.UUID, key string, response StoredResponse) error {
	result, err := database.Exec(s.db, ctx, `
		UPDATE idempotency_keys SET response_status = $3, response_snapshot_json = $4
		WHERE api_client_id = $1 AND key = $2 AND expires_at > now()`,
		clientID, key, response.Status, response.Body,
	)
	if err != nil {
		return fmt.Errorf("complete idempotency key: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("read completion result: %w", err)
	}
	if rows != 1 {
		return fmt.Errorf("idempotency reservation not found or expired")
	}
	return nil
}
