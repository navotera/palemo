# Module Spec — Integration Framework

## Status: Approved | Fase: 3

## Tujuan
Menjadi satu-satunya pintu masuk/keluar antara NPMS dan seluruh sistem eksternal
(WordPress/WooCommerce, OJS, GitHub, GitLab, WHMCS, custom REST API) — tanpa NPMS
mengandung logic spesifik platform mana pun.

## Prinsip Kunci (lihat juga `00-vision-architecture.md §3.1`)
- NPMS hanya tahu konsep generik: Project, Task, Checklist, Notification, Webhook.
- Semua "kecerdasan" platform-spesifik (mis. field apa yang diambil dari WooCommerce
  Order, kapan hook `woocommerce_order_status_completed` di-listen) hidup di **plugin
  eksternal**, bukan di NPMS.
- Setiap connector eksternal terdaftar sebagai satu `api_client` dengan scope terbatas.

## Entity
### `api_clients`
| Field | Tipe | Ket |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | FK |
| name | string | mis. "WordPress WooCommerce Plugin" |
| client_id, client_secret_hash | string | |
| scopes | string[] | mis. `["projects:write","webhooks:manage"]` |
| is_active | boolean | |

### `webhook_subscriptions`
| Field | Tipe | Ket |
|---|---|---|
| id | uuid | PK |
| api_client_id | uuid | FK |
| event | string | mis. `task.completed` |
| target_url | string | |
| secret | string | untuk HMAC signing |
| is_active | boolean | |

### `idempotency_keys`
| Field | Tipe | Ket |
|---|---|---|
| key | string | PK, dikombinasi dengan `api_client_id` |
| api_client_id | uuid | |
| response_snapshot_json | jsonb | |
| expires_at | timestamp | default 24 jam |

## Alur Referensi: WooCommerce Order → Project (dieksekusi oleh plugin eksternal)
```
[Di sisi Plugin WordPress, BUKAN di NPMS]
WooCommerce Order completed
        ↓
Plugin panggil POST /api/v1/projects (dengan Idempotency-Key = order_id)
        ↓
Plugin panggil POST /api/v1/projects/{id}/checklist (jika perlu override template)
        ↓
Plugin panggil POST /api/v1/projects/{id}/assign
        ↓
Plugin panggil POST /api/v1/notifications
```
NPMS hanya menyediakan 4 endpoint generik ini; urutan pemanggilan adalah tanggung jawab
plugin, didokumentasikan sebagai contoh integrasi di dokumentasi API — bukan hardcoded
di server.

## Outbound Webhook
- Event yang bisa disubscribe: `project.created`, `project.status_changed`,
  `task.completed`, `milestone.completed`, `report.ready`.
- Delivery dengan retry (exponential backoff, maks 5x) via job queue (`asynq`, lihat
  `03-tech-stack.md`).
- Payload ditandatangani HMAC-SHA256, klien wajib verifikasi `X-NPMS-Signature`.
- Dashboard NPMS menampilkan log delivery webhook (sukses/gagal, response code) untuk
  memudahkan debugging plugin eksternal.

## Acceptance Criteria
1. Tidak ada satu pun kode di NPMS yang mereferensikan "WooCommerce", "WordPress", "OJS"
   secara harfiah di layer domain/service — hanya di dokumentasi contoh integrasi.
2. API client dengan scope terbatas tidak bisa mengakses endpoint di luar scope-nya
   (mis. client dengan scope `projects:write` saja tidak bisa akses `/reports`).
3. Idempotency key yang sama dari client yang sama dalam 24 jam tidak pernah membuat
   resource dobel, walau request dikirim berkali-kali karena retry jaringan.
4. Webhook yang gagal terkirim 5x berturut-turut otomatis dinonaktifkan (`is_active =
   false`) dan pemilik `api_client` diberi notifikasi.
