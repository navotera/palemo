# Module Spec — Audit Trail

## Status: Approved | Fase: 0 (fondasi, bukan fitur terpisah)

## Tujuan
Menyediakan jejak lengkap "siapa melakukan apa, kapan, dan dari mana" untuk seluruh
mutasi data penting — baik dari user internal maupun sistem eksternal via API.

## Prinsip
- Audit Trail bukan modul yang dibangun terakhir sebagai fitur tambahan, melainkan
  **middleware/interceptor** yang dipasang sejak Fase 0, di layer service (bukan di
  layer controller/handler saja) agar tidak ada mutasi yang lolos tanpa tercatat.
- Event bersifat immutable (append-only). Tidak ada UPDATE/DELETE pada `audit_events`.

## Entity
Lihat `01-domain-model.md §2.12`.

## Cakupan Wajib Dicatat
- Create/update/delete pada: `projects`, `tasks`, `milestones`, `reviews`,
  `checklist_items` (toggle done), status change apa pun.
- Setiap request API eksternal yang membuat/mengubah resource (actor_source berisi nama
  api_client, mis. `api:woocommerce-plugin`).
- Perubahan assignment (siapa di-assign ke task mana, kapan).

## Query & Tampilan
- `GET /api/v1/audit?entity_type=&entity_id=&from=&to=` — timeline per entity.
- Dashboard menampilkan timeline ini di halaman detail Project/Task ("Activity" tab).

## Acceptance Criteria
1. Setiap mutasi lewat API publik menghasilkan minimal satu `audit_events` record dengan
   `actor_source` yang jelas menunjukkan asal (klien mana, bukan hanya "system").
2. `before_json`/`after_json` cukup detail untuk merekonstruksi apa yang berubah tanpa
   perlu melihat log aplikasi terpisah.
3. Retensi data: audit event tidak pernah dihapus otomatis (kecuali ada kebijakan retensi
   eksplisit yang disetujui terpisah, misalnya untuk kepatuhan data privasi).
