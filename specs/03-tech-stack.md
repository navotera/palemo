# 03 — Tech Stack

## Status: Approved
## Versi: 1.1

## 1. Backend

- **Bahasa: Go** — konsisten dengan stack yang sudah dipakai untuk email gateway (SMTP
  pooling project), sehingga tooling, konvensi, dan pengalaman tim bisa reuse.
- Framework HTTP: `gin` sebagai router dan HTTP middleware utama.
- ORM/Query: `gorm` dengan driver PostgreSQL dan association support yang cocok (terutama
  untuk relasi hierarki berjenjang seperti Company→...→Task).
- Job Queue (untuk report generation async, webhook delivery dengan retry):
  `asynq` (berbasis Redis) — ringan dan idiomatic Go.
- Auth/JWT: `golang-jwt/jwt`.
- OpenAPI generation: `swaggo/swag` (anotasi di kode → spec otomatis, mencegah drift).

## 2. Database

- **PostgreSQL** — wajib karena butuh JSONB (structure_json template, metadata), full-text
  search (Wiki), dan row-level constraint kompleks (hierarki self-referencing).
- Migration tool: `golang-migrate` atau `atlas`.

## 3. Frontend (Dashboard NPMS)

- React + TypeScript.
- State/data-fetching: TanStack Query (cocok untuk data hierarkis + polling status report).
- UI Board (Trello-like): `dnd-kit` untuk drag-and-drop kolom/kartu.
- Wiki/Notion-like editor: `Tiptap` (rich text, block-based, extensible).

## 4. Infrastruktur Pendukung

- Redis: job queue + rate limiting counter.
- Object storage (S3-compatible / MinIO): file report PDF, attachment task.
- PDF generation: `gofpdf` atau render HTML→PDF via headless Chrome (`chromedp`) untuk
  layout report yang lebih kaya.

## 5. Observability

- Structured logging: `zerolog` atau `zap`.
- Setiap request API disisipi `request_id` (dipakai juga di `meta.request_id` response).
- Metrics: Prometheus exporter untuk request rate/latency per `api_client` (dasar untuk
  Billing/Usage Metering di masa depan).

## 6. Keputusan yang Perlu Dikonfirmasi User

- [ ] Deploy target: VPS sendiri / cloud managed (mis. untuk Postgres, Redis)?
- [ ] Apakah dashboard NPMS perlu mobile-responsive penuh atau desktop-first cukup di MVP?
- [ ] Apakah GitHub integration di MVP cukup one-way (baca commit/PR) atau perlu two-way
      (update GitHub issue dari NPMS)?

## 7. Aturan Arsitektur Laravel

- Laravel 10 adalah satu-satunya backend/router publik; endpoint terdaftar melalui `backend/routes`.
- Dependency wiring dilakukan di composition root, bukan di handler.
- Handler/controller hanya melakukan binding, authorization boundary, dan response envelope.
- Service tetap menjadi pemilik transaction boundary, audit event, dan business rules.
- Repository wajib menerima tenant scope pada setiap operasi domain.
- Query PostgreSQL khusus dijalankan melalui Query Builder/Eloquent dan wajib mempertahankan constraint,
  idempotency, audit trail, serta perilaku 404 untuk akses lintas tenant.
