# 04 — MVP Roadmap

## Status: Draft — untuk divalidasi ulang dengan user sebelum eksekusi
## Versi: 1.0

## Fase 0 — Fondasi (wajib sebelum modul apa pun)
- Domain model + migrasi DB awal (`tenants`, `divisions`, `teams`, `users`, `projects`,
  `tasks`, `checklist_items`)
- Auth internal (SSO integration, lihat `modules/auth-sso.md`)
- Kerangka API (`api_clients`, idempotency middleware, response envelope, error handling)
- Audit event middleware (dipasang dari awal, bukan ditambahkan belakangan)

## Fase 1 — Execution Core (MVP inti, bisa dipakai harian)
- Board Trello-like (drag-drop task antar kolom)
- Sub Project & hierarki penuh (Portfolio opsional boleh ditunda)
- Project Template (load dari project berjalan → checklist)
- Time Tracking dasar (start/stop, tanpa statistik kompleks dulu)

## Fase 2 — Supervision
- Productivity Dashboard (statistik dasar per staff/team)
- Review Workflow (approve/reject/revision)
- Report PDF export

## Fase 3 — Integration Framework
- REST API publik terdokumentasi (OpenAPI)
- Idempotency key, rate limiting
- Outbound webhook (`task.completed`, `project.status_changed`, dst)
- Connector pertama: **plugin WordPress/WooCommerce** (dikerjakan di repo terpisah,
  bukan bagian dari NPMS core)
- GitHub integration (inbound webhook dari commit/PR → update task)

## Fase 4 — Knowledge Management
- Wiki (nested pages, gaya Notion)
- Meeting Notes, Decision Log, Lessons Learned
- SOP Repository (terhubung dengan SOP Engine di Fase 5)

## Fase 5 — Advanced / Nice-to-have
- SOP Engine (SOP sebagai checklist otomatis yang bisa di-trigger berdasarkan tipe project)
- Automation Engine generik (rule-based: "jika X terjadi, lakukan Y" — di luar hardcoded
  webhook Fase 3)
- AI Assistant / Query Layer atas data dashboard & audit trail
- Billing/Usage Metering per API client
- Template Marketplace internal (share/export/import template antar Division)

## Catatan Prioritas

Urutan ini mengikuti prinsip: **bangun apa yang dipakai harian dulu (Execution)**, baru
lapisan pengukuran (Supervision), baru integrasi eksternal (karena integrasi tanpa data
yang mengalir dari Execution tidak ada gunanya), baru Knowledge (karena Knowledge paling
independen dan bisa disusulkan tanpa blocking modul lain).

Automation Engine generik & AI Assistant sengaja diletakkan paling akhir karena keduanya
butuh data historis yang cukup (dari Fase 1–3) untuk benar-benar berguna — membangunnya
lebih awal berisiko over-engineering tanpa data nyata untuk divalidasi.
