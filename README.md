# Palemo / NPMS

Enterprise work-management platform with a Laravel 10 API and React/Vite frontend.

## Local development

Requirements: PHP 8.1+, Composer, Node.js/npm, PostgreSQL 16, Redis 7, and GNU Make.

```bash
make setup
make migrate-up
make dev
```

Open `http://localhost:5173`. Laravel runs at `http://localhost:8080`; Vite proxies API and
health requests without frontend changes.

Useful commands: `make backend`, `make frontend`, `make test`, `make typecheck`, `make build`,
`make migrate-down`, and `make fmt`.

## Architecture

- `backend/`: active Laravel application and `/api/v1` routes
- `web/`: React/TypeScript frontend
- `db/migrations/`: canonical reversible PostgreSQL migrations
- `spec.md`: engineering handover contract
- `specs/`: approved product/domain specifications
- `cmd/`, `internal/`: inactive legacy Go implementation retained as migration reference

All API data is tenant-scoped. Create operations require `Idempotency-Key`; important
mutations write an audit event in the same transaction. See `spec.md` before modifying the
backend contract.

Docker remains the production packaging workflow:

```bash
docker compose build api
docker compose up -d
```
