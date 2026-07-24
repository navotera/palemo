# 02 â€” API Specification

## Status: Approved
## Versi: 1.0

## 1. Prinsip Umum

- Base path: `/api/v1`
- Format: JSON, `Content-Type: application/json`
- Auth: `Authorization: Bearer <api_client_token>` (lihat Â§3)
- Semua response memakai amplop standar:

```json
{
  "data": { ... },
  "meta": { "request_id": "uuid" },
  "errors": null
}
```

Error response:
```json
{
  "data": null,
  "meta": { "request_id": "uuid" },
  "errors": [
    { "code": "VALIDATION_ERROR", "field": "name", "message": "name is required" }
  ]
}
```

## 2. Versioning

- Path-based (`/api/v1`, `/api/v2`), bukan header-based â€” lebih mudah didukung oleh
  plugin eksternal yang tidak selalu bisa set header custom.
- Breaking change wajib versi baru. Non-breaking (tambah field opsional) boleh di versi
  sama.

## 3. Autentikasi & Otorisasi

- Setiap sistem eksternal (plugin WordPress, OJS, WHMCS, dst) didaftarkan sebagai
  **API Client** (`api_clients` table) dengan `client_id` + `client_secret`.
- Token didapat via `POST /api/v1/auth/token` (client_credentials grant, mirip OAuth2).
- Token JWT berisi `client_id`, `tenant_id`, `scopes` (mis. `projects:write`,
  `webhooks:manage`).
- Untuk user internal (dashboard NPMS sendiri), auth terpisah via SSO (lihat
  `specs/modules/auth-sso.md`).

## 4. Idempotency (Wajib untuk Endpoint Create)

- Header: `Idempotency-Key: <string unik dari klien>`.
- Server menyimpan key selama 24 jam di tabel `idempotency_keys` bersama response yang
  sudah dihasilkan.
- Request kedua dengan key yang sama akan mengembalikan response tersimpan tanpa
  membuat resource baru (return HTTP 200 dengan body identik, bukan 201 duplikat).
- Endpoint wajib idempotent: `POST /projects`, `POST /projects/{id}/checklist`,
  `POST /tasks`, `POST /notifications`.

## 5. Endpoint Inti (Ringkasan Kontrak)

### 5.1 Projects
```
POST   /api/v1/projects
GET    /api/v1/projects/{id}
PATCH  /api/v1/projects/{id}
GET    /api/v1/projects?team_id=&status=&page=
```

**POST /api/v1/projects** â€” body:
```json
{
  "name": "Order #12345 - Custom Theme",
  "team_id": "uuid",
  "template_id": "uuid|null",
  "source": "api:woocommerce-plugin",
  "source_ref": "wc_order_12345",
  "metadata": { "customer_email": "..." }
}
```
Response 201:
```json
{ "data": { "id": "uuid", "status": "planning", "checklist_generated": true } }
```

Acceptance Criteria:
- Jika `template_id` diisi, sistem otomatis clone struktur milestone/task/checklist dari
  `project_templates.structure_json`.
- Jika `source_ref` sudah pernah dipakai oleh `source` yang sama, return existing project
  (idempotent secara bisnis, bukan cuma di level HTTP key).

### 5.2 Checklist
```
POST   /api/v1/projects/{id}/checklist        (generate dari template, atau custom items)
PATCH  /api/v1/tasks/{id}/checklist/{item_id}  (toggle is_done)
```

### 5.3 Assignment
```
POST   /api/v1/projects/{id}/assign
```
Body: `{ "team_id": "uuid" }` atau `{ "assignments": [{"task_id":"uuid","user_id":"uuid"}] }`

### 5.4 Notifications
```
POST   /api/v1/notifications
```
Body: `{ "channel": "email|dashboard", "recipient_id": "uuid", "template": "project_created", "payload": {} }`

### 5.5 Reports
```
GET  /api/v1/reports/productivity?team_id=&from=&to=&format=pdf
```
Jika `format=pdf`, response berupa `{"data": {"download_url": "..."}}` â€” file digenerate
async, klien polling atau menerima webhook `report.ready`.

### 5.6 Reviews
```
POST  /api/v1/reviews
PATCH /api/v1/reviews/{id}   (approve/reject/request_revision)
GET   /api/v1/reviews?entity_type=&entity_id=
```

### 5.7 Time Tracking
```
POST  /api/v1/time-entries/start   { "task_id": "uuid" }
POST  /api/v1/time-entries/stop    { "time_entry_id": "uuid" }
GET   /api/v1/time-entries?user_id=&from=&to=
```

### 5.8 Webhook Management (Outbound)
```
POST   /api/v1/webhooks/subscriptions
DELETE /api/v1/webhooks/subscriptions/{id}
```
Body subscribe:
```json
{ "event": "task.completed", "target_url": "https://client-site.com/wp-json/npms/v1/hook", "secret": "..." }
```
Event yang didukung MVP: `project.created`, `project.status_changed`, `task.completed`,
`milestone.completed`, `report.ready`.

Setiap payload webhook ditandatangani via HMAC-SHA256 di header `X-NPMS-Signature`, klien
wajib verifikasi sebelum memproses.

### 5.9 GitHub Integration
```
POST   /api/v1/integrations/github/link      { "project_id": "uuid", "repo": "org/repo" }
POST   /api/v1/integrations/github/webhook   (inbound dari GitHub, untuk auto-update task dari commit/PR)
```

## 6. Rate Limiting

- Default: 120 request/menit per `api_client`.
- Header response: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.
- HTTP 429 saat terlampaui, body error `code: RATE_LIMITED`.

## 7. Dokumentasi Formal

- Kontrak lengkap wajib dituangkan sebagai **OpenAPI 3.1 spec** (`openapi.yaml`) yang
  digenerate/dipelihara bersamaan dengan kode (bukan ditulis manual terpisah) â€” gunakan
  tool seperti `swaggo` (Go) untuk generate dari anotasi kode agar spec tidak drift dari
  implementasi.

### Project collaboration fields
`POST /api/v1/projects` accepts optional `division_ids: uuid[]` and
`knowledge_page_ids: uuid[]`. The responsible team division is always included in the
participating divisions. Duplicate IDs are removed, and every referenced division and
wiki page must belong to the authenticated tenant. The response returns the resolved
`division_ids` and `knowledge_page_ids`.

### Calendar activity descriptions
`POST /api/v1/tasks` accepts optional `description` text in addition to the task title and
due date. Calendar-planned project activities use `due_date` as their scheduled date;
the selected project finish marker is persisted in project metadata as `finish_date`.

The New Project activity composer offers Calendar Mode, Tree Mode, and Kanban Mode over the same activity
collection. Both modes use one shared form containing editable `date` and Markdown
`description` fields. Calendar Mode initializes `date` from the selected calendar day;

Project creation also accepts `project_type` (`operational`, `technical`, `rnd`, or a
custom 1-40 character label; default `operational`), `tags` (up to 20 unique labels of
1-32 characters), `preliminary_note_template_id`, and `preliminary_notes`. Notes preserve
Markdown plus the editor's limited inline HTML for underline and font color. The selected
template must belong to the authenticated tenant.

`GET /api/v1/preliminary-note-templates` returns tenant-scoped saved notes as
`{id,name,content_markdown}` records using the standard response envelope.

### Workspace settings

`GET/POST /api/v1/settings/project-types` and
`GET/POST /api/v1/settings/project-metadata-fields` manage tenant-scoped project form master
data. `POST /api/v1/settings/users` creates a tenant user assigned to an existing tenant team
and one of the controlled roles. All POST requests require `Idempotency-Key`, admin/manager
authorization, and an audit event.

### Current user profile image
```
PUT /api/v1/users/me/profile-image        multipart field `image`
GET /api/v1/users/{id}/profile-image
```
The authenticated user may replace only their own image. Uploads accept verified JPEG, PNG,
or WebP content up to 2 MB. Reads are tenant-scoped, return `404` across tenants, and use
private cache headers. The binary image is never included in JSON responses or audit data.
Tree Mode initializes it to the next valid planning date. The client maps `date` to task
`due_date`, stores Markdown unchanged in `description`, and derives the required task
`title` from the first meaningful Markdown line. Switching view modes must not mutate or
discard draft activities.

### Division leads

`PUT /api/v1/divisions/{id}/leads` replaces explicit assignments using
`{"user_ids":["uuid"]}`. Only tenant admins may call it. `GET /api/v1/divisions` returns
`lead_user_ids`; tenant admins remain implicit responsible people for every division.

### API client lifecycle and request history
```
GET    /api/v1/api-clients/{id}/history
DELETE /api/v1/api-clients/{id}
```

`GET .../history` returns up to 100 recent tenant-scoped usage events for the selected API
client (`method`, `path`, `status_code`, `duration_ms`, `occurred_at`). `DELETE` is admin-only
and revokes the key by setting `is_active=false`; it never hard-deletes the client or its
usage history. Revocation records an append-only `audit_events` entry.

Kanban Mode groups draft activities by board_column (todo, in_progress, review, done). POST /api/v1/tasks accepts the optional board_column field and defaults it to todo. Switching Calendar, Tree, and Kanban modes preserves dates, Markdown descriptions, and board state.
