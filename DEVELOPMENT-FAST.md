# Fast start (Windows / Laragon)

```powershell
make setup
make migrate-up
make dev
```

If GNU Make is unavailable, run these in separate terminals:

```powershell
php -d extension=pdo_pgsql -d extension=pgsql -S 127.0.0.1:8080 -t backend/public backend/server.php
npm --prefix web run dev -- --host 127.0.0.1 --strictPort
```

Open `http://localhost:5173` and use **Enter development workspace**.
