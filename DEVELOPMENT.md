# Local development

Palemo runs Laravel and Vite directly on the host; Docker is reserved for production.

```text
make setup
make migrate-up
make dev
```

Frontend: `http://localhost:5173`
Laravel API: `http://localhost:8080`

On the current Laragon Windows installation, PostgreSQL extensions exist but are not enabled
globally. Make invokes PHP with `-d extension=pdo_pgsql -d extension=pgsql`, so no php.ini edit
is required.

Do not run `php artisan migrate:fresh`: the application reuses the established NPMS schema.
Use `make migrate-up` and `make migrate-down`, backed by `backend/bin/migrate.php` and the SQL
files in `db/migrations/`.
