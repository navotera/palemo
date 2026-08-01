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

### Run manually on Windows / Laragon

If GNU Make is unavailable, run the backend and frontend in two separate terminals from
the repository root.

Terminal 1 — Laravel backend API:

```powershell
cd C:\laragon\www\Palemo
php -d extension=pdo_pgsql -d extension=pgsql -S 127.0.0.1:8080 -t backend/public backend/server.php
```

Terminal 2 — React/Vite frontend:

```powershell
cd C:\laragon\www\Palemo
npm --prefix web run dev -- --host 127.0.0.1 --strictPort
```

Keep both terminals running, open `http://127.0.0.1:5173`, then select
**Enter development workspace**. The frontend requires the backend API on port `8080`
to open the dashboard.

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
