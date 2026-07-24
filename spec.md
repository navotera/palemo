# Palemo / NPMS Engineering Handover Specification

## 1. Current architecture

As of 2026-07-23 the active stack is:

- Laravel 10 / PHP 8.1 backend in `backend/`
- React 18 + TypeScript + Vite frontend in `web/`
- PostgreSQL 16 and Redis 7
- Versioned reversible SQL migrations in `db/migrations/`
- Docker for production packaging; host processes for local development

The former Gin/GORM implementation remains in `cmd/` and `internal/` only as migration
reference. It is not started by Make, Docker, or the frontend proxy and must not receive new
features. New backend work belongs in Laravel.

## 2. Product invariants

Palemo is an enterprise work-management platform built around Execution, Supervision, and
Knowledge. Its hierarchy is:

`Company → Division → Team → Portfolio → Project → Sub Project → Milestone → Sprint → Task`

Portfolio and Sprint are optional. Every domain query is tenant-scoped. Create operations
require `Idempotency-Key`; important mutations write `audit_events` in the same database
transaction. Cross-tenant identifiers must return 404 without revealing existence.

## 3. Laravel structure

```text
backend/
  app/Http/Controllers/       JSON HTTP boundaries
  app/Http/Middleware/        principal, tenant, request context
  app/Models/                 Eloquent domain models
  app/Services/               business rules and transactions
  app/Repositories/           tenant-scoped persistence abstractions
  app/Support/                response envelope and shared utilities
  routes/api.php              `/api/v1` routes
  routes/web.php              health, OpenAPI and production SPA fallback
  tests/Feature/              HTTP contract tests
db/migrations/                canonical PostgreSQL migration history
web/src/                      unchanged React application
```

Controllers must stay thin as modules mature: validation and response formatting in the
controller, business rules in services, persistence in repositories/Eloquent. Use
`DB::transaction()` for audited mutations. Never use `migrate:fresh` against an existing NPMS
database.

## 4. HTTP contract

All API routes remain below `/api/v1`; the React frontend continues to proxy `/api` and
`/health` to port 8080. JSON responses use:

```json
{"data":{},"meta":{"request_id":"uuid"},"errors":null}
```

Errors use the same envelope with `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`,
`NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, or `INTERNAL_ERROR`.

Development login uses an encrypted, HttpOnly `npms_session` cookie. Production authentication
must use SSO/API client flows; never expose the development session route in production.

## 5. Settings and organization

- Settings uses vertical navigation and list-first views. Add forms slide in from the right.
- Project Types and Project Metadata are tenant-scoped reusable records and appear in New
  Project without changing the React contract.
- Metadata types are text, number, date, boolean, and select; values are stored in
  `projects.metadata.custom_fields`.
- Users have controlled roles: admin, manager, supervisor, staff.
- Admins are responsible for every division by default. Explicit `division_leads` grant a
  user authority to add users only to teams in that division.
- Divisions, users, roles, leads, project types, and metadata mutations are audited.

## 6. New Project behavior

- Project Definition contains the collapsible TOAST UI Preliminary Notes editor.
- Visual is the first editor tab; Markdown is source-only.
- Activity planning switches between Calendar and Tree modes without discarding drafts.
- Both activity modes use Date and Markdown Description.
- Project Settings consumes database Project Types, dynamic metadata, tags, users, reviewers,
  teams, and linked knowledge pages.
- Project creation and activity task creation keep their existing `/api/v1` payloads.

## 7. Local development

Requirements: PHP 8.1+, Composer, Node.js/npm, PostgreSQL, Redis, and GNU Make.

```text
make setup
make migrate-up
make dev
```

`make dev` runs Laravel at `http://localhost:8080` and Vite at
`http://localhost:5173`. The Laragon PHP CLI currently has PostgreSQL DLLs available but not
globally enabled, so Make supplies `pdo_pgsql` and `pgsql` using PHP `-d` flags.

Other commands: `make backend`, `make frontend`, `make test`, `make typecheck`, `make build`,
`make migrate-down`, and `make fmt`.

## 8. Database and migrations

The Laravel backend reuses the existing PostgreSQL schema and data. `backend/bin/migrate.php`
applies the canonical `db/migrations/*.up.sql` and `.down.sql` files while respecting the
existing `schema_migrations` version. Do not run Laravel's default user migrations against
this database.

Every new domain table includes UUID id, tenant_id, created_at, updated_at, tenant index, and a
reversible down migration. Projects, tasks, and knowledge pages use soft deletion.

## 9. Verification and completion

Before handover run:

```text
php -l backend/app/Http/Controllers/*.php
php -d extension=pdo_pgsql -d extension=pgsql backend/artisan route:list
php -d extension=pdo_pgsql -d extension=pgsql backend/artisan test
npm --prefix web run typecheck
npm --prefix web run build
docker compose build api
```

Verify in the browser: development login, executive dashboard, project portfolio, New Project,
Settings lists/drawers, division lead selection, project creation, task creation, review and
time tracking. No new code may depend on Gin, GORM, Go, or the legacy composition root.
