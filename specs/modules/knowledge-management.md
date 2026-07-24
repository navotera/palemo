# Module Spec — Knowledge Management

## Status: Approved | Fase: 4

## Tujuan
Menyediakan ruang dokumentasi terstruktur (gaya Notion) untuk Wiki, catatan meeting,
decision log, dan lessons learned, agar pengetahuan tim tidak hilang atau terkubur di
chat/email.

## Sub-Modul & Entity
Semua sub-modul mewarisi pola dasar: `tenant_id`, `team_id` nullable (null = company-wide),
`title`, `content` (markdown/rich block), `author_id`, `tags[]`, `created_at`, `updated_at`.

### Wiki (`wiki_pages`)
- Mendukung nested page (`parent_page_id`), mirip Notion.
- Full-text search wajib (Postgres `tsvector` minimal untuk MVP).
- Versioning: setiap save signifikan menyimpan snapshot (untuk SOP Engine butuh versi
  spesifik, lihat `sop-engine.md`).

### SOP Repository (`sop_repository`)
- Sub-tipe dari Wiki dengan struktur tambahan: `steps` (array terurut), dipakai sebagai
  sumber SOP Engine.

### Meeting Notes (`meeting_notes`)
- Field tambahan: `meeting_date`, `attendees[]` (array user_id), `related_project_id`
  nullable.

### Decision Log (`decision_logs`)
- Field tambahan: `decision_date`, `context`, `decision`, `consequences`,
  `related_project_id` nullable. Terinspirasi format Architecture Decision Record (ADR).

### Lessons Learned (`lessons_learned`)
- Field tambahan: `related_project_id`, `category` (`process`, `technical`, `communication`).
- Bisa jadi input ke Template Marketplace (project baru bisa "lihat lessons learned dari
  project serupa sebelumnya").


- Setiap knowledge item menyimpan knowledge_types[]. Satu atau lebih tipe aktif dapat dipilih; tipe pertama menjadi tipe utama untuk kompatibilitas endpoint dan tampilan lama.

## API Terkait
```
GET/POST/PATCH  /api/v1/wiki/pages
GET/POST         /api/v1/meeting-notes
GET/POST         /api/v1/decision-logs
GET/POST         /api/v1/lessons-learned
GET              /api/v1/search?q=&type=wiki|meeting|decision|lesson
```

## Acceptance Criteria
1. Wiki page bisa nested minimal 5 level tanpa masalah performa query (gunakan
   `ltree` atau materialized path di Postgres, jangan recursive CTE naif untuk setiap
   render).
2. Pencarian lintas sub-modul (`GET /search`) mengembalikan hasil relevan dari keempat
   tipe konten sekaligus, bukan hanya Wiki.
3. Decision Log dan Lessons Learned bisa di-link ke Project tertentu dan muncul di tab
   "Knowledge" pada halaman detail project tersebut.

- Knowledge items dapat menyimpan hingga 20 external resources sebagai JSON (url, google_docs) tanpa server-side fetching. URL divalidasi dan Google Docs publik dikenali sebagai tipe khusus.

- Knowledge creation supports internal mode (rich-text/Markdown content) and external mode (URL-backed resources without an editor).

- System Knowledge Type Project Preliminary Notes supplies reusable internal Knowledge items to the New Project preliminary-notes loader. Selecting a Knowledge-backed template copies its Markdown without storing it as a preliminary_note_template FK.
