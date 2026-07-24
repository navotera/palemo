package database

import (
	"context"
	"fmt"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// Connection exposes GORM as the canonical persistence API.
type Connection struct {
	GORM *gorm.DB
}

func Open(ctx context.Context, databaseURL string) (*Connection, error) {
	orm, err := gorm.Open(postgres.Open(databaseURL), &gorm.Config{
		SkipDefaultTransaction: true,
		TranslateError:         true,
	})
	if err != nil {
		return nil, fmt.Errorf("open postgres: %w", err)
	}
	db, err := orm.DB()
	if err != nil {
		return nil, fmt.Errorf("access postgres pool: %w", err)
	}
	db.SetMaxOpenConns(20)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(30 * time.Minute)

	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := db.PingContext(pingCtx); err != nil {
		db.Close()
		return nil, fmt.Errorf("ping postgres: %w", err)
	}
	return &Connection{GORM: orm}, nil
}

func (c *Connection) Close() error { return Close(c.GORM) }
