# 00 — Vision & Architecture

## Status: Approved
## Versi: 1.0

## 1. Visi Produk

NPMS bukan sekadar Project Management Tool. NPMS adalah **Enterprise Work Management
Platform** yang menggabungkan:

- Project Management (eksekusi kerja)
- Knowledge Management (pengetahuan & dokumentasi, gaya Notion)
- Workflow Automation (otomatisasi trigger antar sistem)
- Productivity Analytics (supervisi & pengukuran produktivitas)
- Integration Framework (API generik untuk konsumsi eksternal)
- AI Assistant (query layer atas data operasional)

## 2. Tiga Pilar

| Pilar | Tujuan | Modul Terkait |
|---|---|---|
| **Execution** | Kerja harian tim berjalan efisien | Board (Trello-like), Sub Project, Time Tracking |
| **Supervision** | Manajemen bisa mereview & mengukur | Productivity Dashboard, Review Workflow, Audit Trail |
| **Knowledge** | Pengetahuan terdokumentasi & reusable | Wiki, SOP Repository, Meeting Notes, Decision Log, Lessons Learned |

## 3. Prinsip Arsitektur

### 3.1 API-First, Bukan Platform-Aware
NPMS **tidak boleh** memiliki kode yang tahu tentang WordPress, WooCommerce, OJS, WHMCS,
dsb secara spesifik. NPMS hanya mengekspos REST API generik. Semua "kecerdasan" integrasi
platform (mis. listen ke WooCommerce order hook, lalu panggil API NPMS berurutan) hidup di
**plugin/connector eksternal**, di luar codebase NPMS.

Implikasi teknis:
- Tidak ada tabel/model bernama `woocommerce_order` di database NPMS.
- Endpoint bersifat generik: `POST /api/v1/projects`, bukan `POST /api/v1/woocommerce/order`.
- Dokumentasi API (OpenAPI spec) adalah kontrak resmi antara NPMS dan seluruh connector.

### 3.2 Idempotency Wajib
Karena trigger API datang dari sistem eksternal yang bisa retry (network timeout, webhook
duplikat, dsb), setiap endpoint yang membuat resource **wajib** menerima `Idempotency-Key`
di header. Lihat detail di `specs/02-api-specification.md §4`.

### 3.3 Event-Sourced Audit
Setiap mutasi penting (create/update/delete pada Project, Task, Review, Checklist) dicatat
sebagai event di tabel `audit_events`, bukan sekadar `updated_at` timestamp. Event menyimpan:
`actor`, `action`, `entity_type`, `entity_id`, `before`, `after`, `source` (mis. `api:woocommerce-plugin`,
`web:dashboard`), `timestamp`.

### 3.4 Multi-Tenant Sejak Awal
Setiap tabel domain memiliki kolom `tenant_id`, walau untuk saat ini hanya ada satu tenant
aktif (PT milik user). Ini membuka opsi menjadikan NPMS produk SaaS di masa depan tanpa
migrasi skema besar-besaran.

### 3.5 Outbound Webhook (Two-Way Integration)
Selain menerima trigger (inbound), NPMS juga **mengirim** webhook keluar saat event tertentu
terjadi (task selesai, project delay, milestone tercapai) agar sistem eksternal (mis. plugin
WordPress) bisa update status tanpa polling. Lihat `specs/modules/integration-framework.md`.

## 4. Hierarki Organisasi (ringkas — detail di 01-domain-model.md)

```
Company → Division → Team → Portfolio → Project → Sub Project → Milestone → Sprint → Task
```

## 5. Non-Goals (Eksplisit di Luar Scope MVP)

- NPMS tidak membangun UI/plugin WordPress. Itu proyek terpisah yang mengonsumsi API NPMS.
- NPMS tidak menjadi payment gateway atau billing engine untuk WooCommerce. Data order hanya
  diterima sebagai payload untuk membuat Project.
- NPMS tidak menyediakan real-time chat (bukan pengganti Slack/Teams) — cukup Comment/Notes
  per task/project.

## 6. Dependency Antar Spec

- `01-domain-model.md` — struktur data yang jadi dasar semua modul
- `02-api-specification.md` — kontrak API yang dipakai `integration-framework.md`
- `03-tech-stack.md` — keputusan teknis yang membatasi implementasi
- `04-mvp-roadmap.md` — urutan pembangunan
