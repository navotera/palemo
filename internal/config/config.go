package config

import (
	"fmt"
	"os"
)

type Config struct {
	Environment string
	HTTPAddr    string
	DatabaseURL string
	RedisAddr   string
}

func Load() (Config, error) {
	cfg := Config{
		Environment: envOrDefault("APP_ENV", "development"),
		HTTPAddr:    envOrDefault("HTTP_ADDR", ":8080"),
		DatabaseURL: os.Getenv("DATABASE_URL"),
		RedisAddr:   envOrDefault("REDIS_ADDR", "localhost:6379"),
	}
	if cfg.DatabaseURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL is required")
	}
	return cfg, nil
}

func envOrDefault(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
