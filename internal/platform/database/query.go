package database

import (
	"context"
	"database/sql"
	"errors"
	"regexp"
	"strconv"

	"gorm.io/gorm"
)

type Result struct {
	rowsAffected int64
}

func (r Result) RowsAffected() (int64, error) {
	return r.rowsAffected, nil
}

type RowScanner interface {
	Scan(dest ...any) error
}

var ErrNotFound = gorm.ErrRecordNotFound

type NullInt32 = sql.NullInt32

func Row(db *gorm.DB, ctx context.Context, query string, args ...any) RowScanner {
	query, args = bindPostgres(query, args)
	return db.WithContext(ctx).Raw(query, args...).Row()
}

func Rows(db *gorm.DB, ctx context.Context, query string, args ...any) (*sql.Rows, error) {
	query, args = bindPostgres(query, args)
	return db.WithContext(ctx).Raw(query, args...).Rows()
}

func Exec(db *gorm.DB, ctx context.Context, query string, args ...any) (Result, error) {
	query, args = bindPostgres(query, args)
	statement := db.WithContext(ctx).Exec(query, args...)
	return Result{rowsAffected: statement.RowsAffected}, statement.Error
}

func Begin(db *gorm.DB, ctx context.Context) (*gorm.DB, error) {
	tx := db.WithContext(ctx).Begin()
	return tx, tx.Error
}

func Commit(tx *gorm.DB) error {
	return tx.Commit().Error
}

func Rollback(tx *gorm.DB) {
	_ = tx.Rollback().Error
}

func IsNotFound(err error) bool {
	return errors.Is(err, sql.ErrNoRows) || errors.Is(err, gorm.ErrRecordNotFound)
}

func Pool(db *gorm.DB) (*sql.DB, error) {
	return db.DB()
}

func Ping(ctx context.Context, db *gorm.DB) error {
	pool, err := db.DB()
	if err != nil {
		return err
	}
	return pool.PingContext(ctx)
}

func Close(db *gorm.DB) error {

	pool, err := db.DB()
	if err != nil {
		return err
	}
	return pool.Close()
}

var postgresPlaceholder = regexp.MustCompile(`\$([1-9][0-9]*)`)

func bindPostgres(query string, args []any) (string, []any) {
	bound := make([]any, 0, len(args))
	normalized := postgresPlaceholder.ReplaceAllStringFunc(query, func(token string) string {
		position, err := strconv.Atoi(token[1:])
		if err != nil || position < 1 || position > len(args) {
			return token
		}
		bound = append(bound, args[position-1])
		return "?"
	})
	return normalized, bound
}
