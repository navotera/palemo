package idempotency

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/npms-platform/npms/internal/platform/database"
	"gorm.io/gorm"

	"github.com/google/uuid"
)

type UserService struct{ db *gorm.DB }

func NewUserService(db *gorm.DB) *UserService { return &UserService{db: db} }

func (s *UserService) Reserve(ctx context.Context, tenantID, userID uuid.UUID, key, requestHash string) (*StoredResponse, error) {
	if key == "" {
		return nil, fmt.Errorf("idempotency key is required")
	}
	var storedHash string
	var status database.NullInt32
	var body []byte
	err := database.Row(s.db, ctx, `
		INSERT INTO user_idempotency_keys (tenant_id, user_id, key, request_hash)
		VALUES ($1,$2,$3,$4)
		ON CONFLICT (tenant_id,user_id,key) DO UPDATE SET key=EXCLUDED.key
		RETURNING request_hash,response_status,response_snapshot_json`, tenantID, userID, key, requestHash,
	).Scan(&storedHash, &status, &body)
	if err != nil {
		return nil, fmt.Errorf("reserve user idempotency key: %w", err)
	}
	if storedHash != requestHash {
		return nil, ErrPayloadConflict
	}
	if status.Valid && len(body) > 0 {
		return &StoredResponse{Status: int(status.Int32), Body: json.RawMessage(body)}, nil
	}
	return nil, nil
}

func (s *UserService) Complete(ctx context.Context, tenantID, userID uuid.UUID, key string, response StoredResponse) error {
	result, err := database.Exec(s.db, ctx, `UPDATE user_idempotency_keys SET response_status=$4,response_snapshot_json=$5
		WHERE tenant_id=$1 AND user_id=$2 AND key=$3 AND expires_at>now()`, tenantID, userID, key, response.Status, response.Body)
	if err != nil {
		return fmt.Errorf("complete user idempotency key: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil || rows != 1 {
		return fmt.Errorf("user idempotency reservation missing or expired")
	}
	return nil
}
