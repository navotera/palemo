ifeq ($(OS),Windows_NT)
SHELL := powershell.exe
.SHELLFLAGS := -NoProfile -Command
PREPARE_ENV = if (-not (Test-Path .env)) { Copy-Item .env.example .env }
CHECK_PHP = if (-not (Get-Command $(PHP) -ErrorAction SilentlyContinue)) { throw "PHP 8.1+ is required" }
CHECK_COMPOSER = if (-not (Get-Command $(COMPOSER) -ErrorAction SilentlyContinue)) { throw "Composer is required" }
CHECK_NPM = if (-not (Get-Command $(NPM) -ErrorAction SilentlyContinue)) { throw "Node.js/npm is required" }
WEB_INSTALL = Set-Location web; $(NPM) install
WEB_DEV = Set-Location web; $(NPM) run dev -- --host 127.0.0.1 --strictPort
WEB_TYPECHECK = Set-Location web; $(NPM) run typecheck
WEB_BUILD = Set-Location web; $(NPM) run build
else
SHELL := /bin/sh
PREPARE_ENV = test -f .env || cp .env.example .env
CHECK_PHP = command -v $(PHP) >/dev/null
CHECK_COMPOSER = command -v $(COMPOSER) >/dev/null
CHECK_NPM = command -v $(NPM) >/dev/null
WEB_INSTALL = cd web && $(NPM) install
WEB_DEV = cd web && $(NPM) run dev -- --host 127.0.0.1 --strictPort
WEB_TYPECHECK = cd web && $(NPM) run typecheck
WEB_BUILD = cd web && $(NPM) run build
endif

-include .env
export

PHP ?= php
COMPOSER ?= composer
NPM ?= npm
PHP_PGSQL = $(PHP) -d extension=pdo_pgsql -d extension=pgsql

.DEFAULT_GOAL := help
.PHONY: help setup check-tools dev backend frontend migrate-up migrate-down fmt typecheck test build clean

help:
	@echo "Palemo Laravel + React development"
	@echo "  make setup         Install Composer and npm dependencies"
	@echo "  make dev           Run Laravel API (:8080) and Vite UI (:5173)"
	@echo "  make backend       Run only the Laravel API"
	@echo "  make frontend      Run only the Vite frontend"
	@echo "  make migrate-up    Apply PostgreSQL migrations"
	@echo "  make migrate-down  Roll back one migration"
	@echo "  make test          Run Laravel tests and frontend typecheck"
	@echo "  make build         Optimize Laravel and build frontend"

setup:
	@$(PREPARE_ENV)
	$(COMPOSER) --working-dir=backend install
	$(WEB_INSTALL)

check-tools:
	@$(CHECK_PHP)
	@$(CHECK_COMPOSER)
	@$(CHECK_NPM)
	@$(PHP) --version
	@$(COMPOSER) --version
	@$(NPM) --version

dev: check-tools
	@echo "Frontend: http://localhost:5173"
	@echo "Laravel API: http://localhost:8080"
	@$(MAKE) --no-print-directory -j2 backend frontend

backend:
	$(PHP_PGSQL) -S 127.0.0.1:8080 -t backend/public backend/server.php

frontend:
	$(WEB_DEV)

migrate-up:
	$(PHP_PGSQL) backend/bin/migrate.php up

migrate-down:
	$(PHP_PGSQL) backend/bin/migrate.php down

fmt:
	$(PHP) backend/vendor/bin/pint

typecheck:
	$(WEB_TYPECHECK)

test:
	$(PHP_PGSQL) backend/vendor/bin/phpunit -c backend/phpunit.xml
	$(WEB_TYPECHECK)

build:
	$(PHP_PGSQL) backend/artisan optimize
	$(WEB_BUILD)

clean:
	$(PHP) backend/artisan optimize:clear
