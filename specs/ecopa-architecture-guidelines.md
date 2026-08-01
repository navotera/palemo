# Ecopa — Architecture Guidelines

**Untuk:** AI coding agent yang mengerjakan development Ecopa
**Stack:** Laravel/PHP (Ecopa + seluruh aplikasi anak)
**Status proyek:** Aplikasi anak (Akunta, Presensi, PM, dst) sudah eksis dan berjalan. Ecopa dibangun sebagai layer baru yang mengintegrasikan mereka.

---

## 1. Konsep inti

Ecopa adalah **portal aplikasi terpusat** sekaligus **Identity & Access Management (IAM) hub** untuk ekosistem aplikasi internal (Akunta, Presensi, Project Management, dan aplikasi lain yang akan menyusul).

Dua peran Ecopa:

1. **Application Portal** — tempat user melihat dan membuka aplikasi yang mereka punya akses.
2. **Central Identity Provider (IdP)** — sumber kebenaran tunggal untuk identitas user, keanggotaan divisi, dan hak akses ke tiap aplikasi. Ecopa mem-broadcast perubahan (user dihapus, dipindah divisi, dsb) ke semua aplikasi anak yang terdampak.
3. **Notification Hub** — titik pengiriman email terpusat untuk seluruh ekosistem. Aplikasi anak meminta Ecopa mengirimkan notifikasi ke user, bukan mengelola pengiriman email sendiri-sendiri. Detail di bagian 7.

Pola arsitektur: **Hub-and-Spoke**. Ecopa di tengah sebagai hub, tiap aplikasi anak adalah spoke yang:
- Mempercayakan autentikasi ke Ecopa (SSO/OIDC)
- Menerima notifikasi perubahan akses dari Ecopa (event/webhook)

Agent **tidak boleh** membangun logika bisnis aplikasi anak (Akunta, Presensi, dll) di dalam Ecopa. Ecopa hanya mengurus identitas, akses, dan katalog aplikasi — bukan data operasional aplikasi anak.

---

## 2. Prioritas pengerjaan

Kerjakan sesuai urutan ini. Jangan lompat ke fase berikutnya sebelum fase sebelumnya stabil.

1. **Fase 1 — SSO/OIDC login** *(prioritas saat ini)*
2. **Fase 2 — App registry & portal launcher** (daftar aplikasi + tampilan bookmark/launcher)
3. **Fase 3 — Webhook lifecycle event** (deprovisioning otomatis)
4. **Fase 4 — Audit log & admin dashboard**
5. **Fase 5 — Notifikasi email terpusat** (Notification Hub)
6. **Fase 6 — Master Data / Organizational Data Hub**
7. **Fase 7 — Access Request / Self-service Provisioning**
8. **Fase 8 — In-app Notification Center**
9. **Fase 9 — App Health Monitoring**
10. **Fase 10 — Audit Log Aggregator lintas aplikasi**

Fase 6–10 melengkapi fase-fase sebelumnya (bukan prasyarat untuk fase 1–5) dan bisa dikerjakan belakangan sesuai kebutuhan bisnis, tapi urutan di atas adalah urutan yang disarankan berdasarkan seberapa langsung fase tersebut melengkapi fondasi IAM/Notification Hub yang sudah dirancang.

---

## 3. Fase 1: SSO/OIDC — Detail Arsitektur

### 3.1 Peran masing-masing pihak

- **Ecopa** = OAuth2 Provider (Identity Provider). Menggunakan Laravel Passport.
- **Akunta / Presensi / PM** = OAuth2 Client (Service Provider). Menggunakan Laravel Socialite dengan custom driver.

Karena seluruh aplikasi anak berbasis Laravel, tidak perlu menjembatani protokol lintas bahasa — cukup satu custom Socialite provider yang dipakai ulang di semua aplikasi anak (idealnya dijadikan package composer privat internal, bukan copy-paste kode di tiap aplikasi).

### 3.2 Flow autentikasi (Authorization Code Flow)

1. User buka aplikasi anak (misal Akunta) → klik "Login dengan Ecopa SSO"
2. Aplikasi anak redirect ke `https://ecopa.internal/oauth/authorize`
3. Jika user belum login di Ecopa → tampilkan form login Ecopa
4. Setelah berhasil, Ecopa redirect kembali ke aplikasi anak dengan `authorization code`
5. Aplikasi anak tukar `code` menjadi `access_token` lewat `POST /oauth/token`
6. Aplikasi anak panggil `GET /api/userinfo` dengan `access_token` untuk mendapat identitas user
7. Aplikasi anak buat/update user lokal berdasarkan data tsb, lalu login-kan user secara lokal

### 3.3 Standar level OIDC yang dipakai

Untuk kebutuhan internal, **tidak wajib full OIDC-compliant** (tidak perlu `id_token` JWT). Cukup:
- OAuth2 Authorization Code Flow (via Laravel Passport)
- Endpoint kustom `/api/userinfo` yang mengembalikan klaim user (setara `UserInfo Endpoint` di OIDC)

Baru upgrade ke full OIDC (`id_token`, JWKS, discovery endpoint) **jika** di masa depan Ecopa perlu diintegrasikan dengan tool pihak ketiga yang mensyaratkan OIDC standar penuh (misal Grafana, Metabase, dsb).

### 3.4 Data yang wajib dikembalikan `/api/userinfo`

Minimal harus memuat:
- `sub` (user id di Ecopa — dipakai sebagai foreign key oleh aplikasi anak, bukan email, karena email bisa berubah)
- `name`, `email`
- `division` (nama divisi/unit)
- `apps` (daftar app_id yang user ini masih punya akses — berguna untuk otorisasi tambahan di sisi aplikasi anak)

### 3.5 Registrasi client

Setiap aplikasi anak didaftarkan sebagai OAuth client di Ecopa (`passport:client`), dengan `redirect_uri` yang eksplisit. Jangan gunakan wildcard redirect URI.

### 3.6 Hal yang harus diperhatikan agent saat implementasi

- `client_secret` tiap aplikasi anak harus unik dan disimpan sebagai env var, tidak pernah di-commit ke repo.
- Token harus punya expiry pendek (access token) + refresh token untuk sesi panjang.
- Saat user logout dari Ecopa, idealnya trigger logout juga di aplikasi anak (single logout) — ini bisa jadi item lanjutan, tidak wajib di fase 1 kalau kompleksitasnya terlalu tinggi.
- User lokal di aplikasi anak harus disimpan dengan referensi ke `sub` (Ecopa user id), bukan mengandalkan email sebagai primary matching key.

---

## 3.7 Login via Identity Provider eksternal (Google SSO)

### 3.7.1 Prinsip

Ecopa berperan sebagai **Identity Broker**: Google bukan IdP yang langsung dipercaya oleh aplikasi anak, melainkan hanya dipercaya oleh Ecopa. Aplikasi anak tetap hanya berbicara OAuth2/OIDC ke Ecopa seperti biasa (bagian 3.2) — mereka tidak tahu dan tidak perlu tahu bahwa di baliknya user login pakai akun Google. Ini menjaga abstraksi hub tetap utuh: kalau suatu saat Ecopa mau ganti/tambah provider eksternal lain (Microsoft, dsb), aplikasi anak tidak perlu berubah sama sekali.

### 3.7.2 Alur lengkap

1. User buka aplikasi anak → klik "Login dengan Ecopa SSO" → redirect ke `/oauth/authorize` Ecopa (flow standar, sama seperti 3.2 langkah 1–2)
2. Di halaman login Ecopa, user pilih opsi **"Login dengan Google"** (selain opsi login manual email/password Ecopa)
3. Ecopa redirect user ke Google OAuth consent screen (pakai Laravel Socialite driver `google` bawaan, tidak perlu custom provider)
4. Google redirect kembali ke **callback Ecopa** (`/auth/google/callback`) — bukan langsung ke aplikasi anak
5. Ecopa terima profil dari Google (email, nama) → **cek `email` tersebut ada di tabel `users` Ecopa atau tidak**:
   - **Ada & aktif** → ambil data user (termasuk `division`) → lanjutkan proses `/oauth/authorize` yang sempat tertunda di langkah 1, hasilkan `authorization code` → redirect balik ke `redirect_uri` aplikasi anak yang memicu login di awal (flow lanjut normal seperti 3.2 langkah 4 dst)
   - **Tidak ada / user nonaktif** → tolak login, tampilkan pesan bahwa akun belum terdaftar di Ecopa, **jangan auto-create user baru** hanya karena berhasil login Google (lihat 3.7.4)

### 3.7.3 Batasan domain Google

Gunakan parameter `hd` (hosted domain) saat redirect ke Google, supaya Google sendiri membatasi pilihan akun hanya ke akun Google Workspace milik domain perusahaan — ini lapisan tambahan sebelum pengecekan email di Ecopa, bukan pengganti pengecekan di langkah 3.7.2.

```php
Socialite::driver('google')
    ->with(['hd' => 'perusahaan.com'])
    ->redirect();
```

### 3.7.4 Aturan provisioning

Login lewat Google **tidak boleh** dipakai sebagai jalur pembuatan user baru secara otomatis. User harus sudah terdaftar di Ecopa lebih dulu (lewat proses onboarding/HR yang sudah ada, atau lewat Fase 7 — Access Request), baru login Google berfungsi sebagai *alternatif metode autentikasi* untuk akun yang sudah ada. Ini mencegah siapa pun dengan akun Google mana pun otomatis dapat akses hanya karena berhasil login Google — pencocokan `email` hanya untuk *matching*, bukan *provisioning*.

### 3.7.5 Data model tambahan

Tabel `users` perlu kolom `google_id` (nullable) untuk menyimpan identifier Google setelah login pertama kali berhasil, supaya login berikutnya bisa langsung dicocokkan lewat `google_id`, bukan hanya `email` (email di Google bisa saja berubah, meski jarang).

### 3.7.6 Hal yang harus diperhatikan agent saat implementasi

- Pakai `laravel/socialite` driver `google` resmi — tidak perlu bikin custom provider seperti untuk `EcopaProvider` (bagian 3.2), karena Google sudah didukung native.
- Simpan `GOOGLE_CLIENT_ID` dan `GOOGLE_CLIENT_SECRET` di `.env` Ecopa (bukan di database), karena ini kredensial tingkat Ecopa, bukan per-aplikasi-anak.
- Callback Google harus tetap menjaga `state` parameter dari request `/oauth/authorize` yang tertunda (langkah 1), supaya setelah login Google selesai, Ecopa tahu harus melanjutkan otorisasi ke aplikasi anak mana. Socialite menangani `state` untuk Google, tapi agent perlu memastikan konteks aplikasi anak asal tidak hilang di antara dua hop redirect ini (simpan di session sebelum redirect ke Google).
- Login manual (email/password Ecopa) tetap harus tersedia sebagai alternatif — jangan hilangkan opsi ini hanya karena Google SSO sudah ada, terutama untuk service account atau situasi Google Workspace bermasalah.

---

## 3.8 Integrasi via Settings UI (self-service configuration)

Setelah package Laravel Ecopa SSO Client tersedia (lihat 3.1), aplikasi anak tidak harus integrasi lewat edit `.env` manual di server. Sediakan halaman **Settings → Integrasi Ecopa** di admin panel tiap aplikasi anak, sebagai bagian dari package tersebut, supaya proses integrasi bisa dilakukan admin aplikasi anak sendiri tanpa akses server.

### Alur registrasi (dua arah)

1. Admin Ecopa mendaftarkan aplikasi anak di Ecopa (via `passport:client` atau UI admin Ecopa) → menghasilkan `client_id` + `client_secret`.
2. Admin aplikasi anak membuka halaman Settings → memasukkan kredensial dari langkah 1.
3. Admin menekan tombol **Test Koneksi** untuk validasi sebelum SSO diaktifkan.
4. Setelah tervalidasi, admin mengaktifkan toggle SSO.

### Parameter wajib di UI Settings aplikasi anak

| Field | Tipe input | Catatan implementasi |
|---|---|---|
| Ecopa Base URL | text | Default terisi otomatis, tetap bisa diubah untuk kebutuhan staging |
| Client ID | text | Diberikan Ecopa saat registrasi aplikasi |
| Client Secret | password, masked setelah tersimpan | Simpan terenkripsi; jangan tampilkan ulang nilai penuh setelah input pertama |
| Redirect URI | text, **read-only/auto-generated** | Jangan biarkan admin mengetik manual — rawan salah, harus persis sama dengan yang didaftarkan di Ecopa |
| Webhook Secret | password, masked | Dipakai untuk verifikasi signature saat menerima event dari Ecopa (lihat bagian 5) |
| Toggle "Aktifkan SSO" | boolean | Default off sampai Test Koneksi berhasil |
| Toggle "Wajibkan SSO (nonaktifkan login lokal)" | boolean | Opsional — memungkinkan migrasi bertahap, tidak langsung mematikan login lama |
| Tombol "Test Koneksi" | action | Memanggil endpoint `/api/userinfo` Ecopa dengan kredensial yang diinput untuk validasi sebelum SSO diaktifkan |

### Aturan penyimpanan config

- Field non-sensitif (base URL, toggle) disimpan di tabel `settings` biasa.
- Field sensitif (`client_secret`, `webhook_secret`) disimpan dengan enkripsi (`encrypted` cast Laravel), bukan plaintext di database.
- Package harus menyediakan opsi fallback ke `.env` untuk tim yang lebih memilih menyimpan secret di level server daripada database — jangan paksakan satu pendekatan saja.
- Redirect URI yang ditampilkan di UI harus dihasilkan otomatis dari route package (`route('ecopa.callback')`), bukan diketik manual oleh admin.

---

## 4. Fase 2: App Registry & Portal Launcher

### 4.1 Tabel `apps` (katalog aplikasi)

Field minimal: `id`, `name`, `description`, `icon_url`, `base_url`, `client_id`, `client_secret_hash`, `webhook_url`, `webhook_secret`, `is_active`.

### 4.2 Tabel `user_app_access`

Ini tabel pivot yang menjadi **source of truth** siapa boleh akses aplikasi apa. Field minimal: `id`, `user_id`, `app_id`, `role_or_scope`, `granted_at`, `revoked_at`.

Portal (tampilan bookmark) di frontend Ecopa cukup query tabel ini untuk menampilkan aplikasi apa saja yang muncul untuk user yang sedang login.

---

## 5. Fase 3: Webhook Lifecycle Event

### 5.1 Prinsip

Setiap perubahan yang memengaruhi akses user (dihapus, dinonaktifkan, pindah divisi, dicabut aksesnya dari aplikasi tertentu) harus **memicu event asinkron** ke aplikasi anak yang terdampak — bukan panggilan sinkron yang bisa memblokir proses admin di Ecopa.

### 5.2 Mekanisme

- Gunakan Laravel Queue (job `ShouldQueue`) untuk mengirim webhook, jangan panggil HTTP langsung di request cycle.
- Setiap webhook **wajib ditandatangani** (HMAC-SHA256 memakai `webhook_secret` masing-masing aplikasi) supaya aplikasi anak bisa verifikasi keasliannya.
- Retry dengan backoff bertahap bila aplikasi anak gagal merespons (misal 5 percobaan dengan jeda meningkat).
- Event harus **idempotent** — aplikasi anak harus aman menerima event yang sama dua kali (misal karena retry), tidak boleh terjadi efek ganda.

### 5.3 Event minimal yang perlu didukung

- `user.access_revoked` — akses user ke satu aplikasi dicabut
- `user.deactivated` — user dinonaktifkan sepenuhnya (trigger revoke ke semua aplikasi yang dia punya akses)
- `user.division_changed` — perpindahan divisi (aplikasi anak boleh re-evaluasi hak akses berdasarkan ini)

### 5.4 Kontrak webhook

```
POST {webhook_url}
Header: X-Ecopa-Signature: <hmac_sha256>
Body:
{
  "event": "user.access_revoked",
  "user_id": "...",
  "app_id": "...",
  "timestamp": "2026-07-31T10:00:00Z"
}
```

Aplikasi anak wajib: verifikasi signature → cek idempotency (jangan proses ulang event yang sudah pernah diproses) → update akses lokal.

---

## 6. Fase 4: Audit Log & Admin Dashboard

Setiap perubahan akses (baik lewat aksi admin manual maupun otomatis dari sistem) harus tercatat di tabel `audit_logs`: siapa pelaku, aksi apa, target siapa/apa, kapan. Ini bukan fitur opsional — tanpa audit trail, sulit menelusuri kenapa akses seseorang berubah saat terjadi masalah.

---

## 7. Fase 5: Notifikasi Email Terpusat (Notification Hub)

### 7.1 Prinsip

Aplikasi anak tidak mengelola SMTP/pengiriman email sendiri untuk notifikasi ke user. Semua permintaan notifikasi email dikirim ke Ecopa lewat API, dan Ecopa yang bertanggung jawab merender dan mengirimkannya. Tujuannya: satu domain pengirim dengan reputasi terjaga (SPF/DKIM/DMARC konsisten), branding email seragam, dan log pengiriman terpusat.

### 7.2 Autentikasi

Menggunakan `client_credentials` grant dari OAuth client yang sama dengan yang dipakai aplikasi anak untuk SSO (lihat 3.5) — tidak perlu kredensial terpisah. Ini panggilan server-to-server, bukan atas nama user yang sedang login.

### 7.3 Kontrak API

```
POST /api/notifications/email
Authorization: Bearer <client_credentials_token>

Body:
{
  "recipient": { "user_id": "<ecopa_sub>" }  // atau { "email": "...", "name": "..." } untuk penerima non-terdaftar
  "template_key": "akunta.invoice_overdue",
  "variables": { "invoice_number": "INV-001", "due_date": "2026-08-15" },
  "category": "billing",
  "type": "transactional"   // "transactional" | "broadcast"
}

Response:
{ "notification_id": "...", "status": "queued" }
```

### 7.4 Manajemen template

- Template (subject + body + daftar variabel yang dibutuhkan) didaftarkan per aplikasi, disimpan di tabel `email_templates` (`id`, `app_id`, `key`, `subject`, `body_html`, `variables_schema`, `locale`).
- Registrasi template bisa lewat halaman Settings aplikasi anak (perluasan dari 3.8) atau lewat admin panel Ecopa langsung — pilih salah satu sebagai standar, jangan dua-duanya berjalan paralel.
- Aplikasi anak **hanya mengirim data (variables)**, tidak pernah mengirim HTML mentah — supaya Ecopa tetap satu-satunya pihak yang mengontrol tampilan akhir email.

### 7.5 Pengiriman & keandalan

- Pengiriman lewat queue job (`ShouldQueue`), bukan sinkron di request cycle, dengan retry berjenjang sama seperti webhook (lihat 5.2).
- Setiap pengiriman dicatat di `notification_logs` (`id`, `app_id`, `user_id`, `template_key`, `status`, `sent_at`, `error_message`) — dipakai untuk audit dan debugging kalau user komplain "tidak menerima email".
- Status pengiriman (`sent`, `failed`, `bounced`) bisa dikembalikan ke aplikasi anak lewat webhook callback (`notification.delivered`, `notification.failed`) memakai mekanisme signing yang sama seperti bagian 5.4 — opsional, tidak wajib di iterasi pertama.

### 7.6 Preferensi & tipe notifikasi

- Bedakan `type: transactional` (wajib terkirim — reset password, invoice, dsb, tidak boleh terpengaruh preferensi opt-out) dari `type: broadcast` (pengumuman umum — harus menghormati preferensi user).
- Sediakan tabel `user_notification_preferences` (`user_id`, `category`, `opt_in`) supaya user bisa mengatur kategori notifikasi broadcast mana yang mereka mau terima, dikelola terpusat di Ecopa — bukan per aplikasi anak.
- Notifikasi `transactional` selalu terkirim terlepas dari preferensi opt-out.

### 7.7 Rate limiting

Ecopa harus membatasi jumlah request notifikasi per aplikasi anak per satuan waktu, supaya satu aplikasi yang salah konfigurasi (misal terjebak loop) tidak menghabiskan reputasi domain pengirim untuk seluruh ekosistem.

---

## 9. Fase 6: Master Data / Organizational Data Hub

### 9.1 Prinsip

Ecopa jadi sumber kebenaran untuk data organisasi yang dipakai lintas aplikasi anak — bukan hanya identitas login (nama, email), tapi juga atribut organisasi: struktur divisi, jabatan, cost center, nomor pegawai. Ini mencegah tiap aplikasi anak menyimpan salinan data pegawai sendiri yang rawan tidak sinkron (misal pegawai pindah divisi, tapi di Presensi masih tercatat divisi lama).

### 9.2 Data model

Tabel tambahan: `positions` (jabatan), `cost_centers`, `employee_profiles` (`user_id`, `employee_number`, `position_id`, `cost_center_id`, `join_date`, `employment_status`). Tabel `divisions` yang sudah ada (bagian 2) dipakai bersama.

### 9.3 Distribusi perubahan

Perubahan pada master data (pegawai pindah jabatan/cost center) memicu event lewat mekanisme webhook yang sama dengan bagian 5 (`employee.updated`), supaya aplikasi anak yang menyimpan cache lokal data ini tetap sinkron.

### 9.4 Kontrak API

```
GET /api/master-data/employees/{id}
GET /api/master-data/divisions
GET /api/master-data/cost-centers
```

Aplikasi anak sebaiknya fetch on-demand kalau memungkinkan. Kalau butuh cache lokal untuk performa, wajib subscribe ke event `employee.updated` supaya cache tidak basi.

### 9.5 Batasan

Ecopa hanya menyimpan atribut organisasi generik yang dipakai bersama. Data operasional spesifik aplikasi (misal alokasi budget project di PM) tetap milik aplikasi anak masing-masing.

---

## 10. Fase 7: Access Request / Self-service Provisioning

### 10.1 Prinsip

Melengkapi siklus lifecycle akses secara penuh. Bagian 5 (webhook lifecycle event) baru menangani pencabutan akses (deprovisioning) — fase ini menangani sisi sebaliknya: permintaan dan pemberian akses (provisioning).

### 10.2 Alur

1. User buka portal Ecopa → pilih aplikasi yang belum dia punya akses → klik "Minta Akses"
2. Sistem tentukan approver — default atasan langsung (diambil dari data organisasi di Fase 6), atau approver custom per aplikasi
3. Approver menerima notifikasi (lewat Notification Hub, bagian 7) → approve/reject lewat portal
4. Jika disetujui → insert ke `user_app_access` → trigger event `user.access_granted` ke aplikasi anak (webhook, mekanisme sama dengan bagian 5) supaya aplikasi anak bisa provisioning otomatis (misal buat local user record)

### 10.3 Data model

Tabel `access_requests` (`id`, `user_id`, `app_id`, `requested_at`, `approver_id`, `status`: pending/approved/rejected, `decided_at`, `reason`).

### 10.4 Event tambahan

`user.access_granted` — pasangan dari `user.access_revoked` yang sudah dirancang di bagian 5.3.

### 10.5 Catatan implementasi

Mulai dengan approval satu level (satu approver) di iterasi awal. Approval berjenjang (multi-level) bisa menyusul kalau memang dibutuhkan organisasi.

---

## 11. Fase 8: In-app Notification Center

### 11.1 Prinsip

Pelengkap Notification Hub (bagian 7) yang khusus menangani email. Fase ini untuk notifikasi dalam aplikasi (in-app) — kotak masuk terpusat di portal Ecopa yang mengumpulkan notifikasi dari semua aplikasi anak, supaya user tidak harus membuka tiap aplikasi satu-satu untuk memeriksa notifikasi.

### 11.2 Kontrak API

```
POST /api/notifications/in-app
Authorization: Bearer <client_credentials_token>

Body:
{
  "recipient": { "user_id": "<ecopa_sub>" },
  "title": "Invoice INV-001 jatuh tempo",
  "body": "...",
  "action_url": "https://akunta.internal/invoices/1",
  "category": "billing"
}
```

### 11.3 Data model

Tabel `in_app_notifications` (`id`, `user_id`, `app_id`, `title`, `body`, `action_url`, `read_at`, `created_at`).

### 11.4 Tampilan

Portal Ecopa menampilkan badge/counter notifikasi belum dibaca dan daftar notifikasi lintas aplikasi. Klik notifikasi mengarahkan user ke `action_url`, yang bisa berupa link balik ke aplikasi anak terkait.

### 11.5 Realtime (opsional, iterasi lanjutan)

Update realtime tanpa refresh bisa ditambahkan belakangan lewat Laravel Echo + websocket (Pusher/Soketi/Reverb). Tidak wajib di versi pertama — polling sederhana sudah cukup untuk awal.

---

## 12. Fase 9: App Health Monitoring

### 12.1 Prinsip

Dashboard yang menampilkan status kesehatan tiap aplikasi anak dari satu tempat, memudahkan admin IT memantau ekosistem tanpa cek satu-satu.

### 12.2 Mekanisme

Dua pilihan pendekatan:
- **Heartbeat (push)** — aplikasi anak kirim ping berkala: `POST /api/health/heartbeat` dengan `app_id`, `version`, `status`.
- **Polling (pull)** — Ecopa memanggil endpoint `/health` masing-masing aplikasi anak secara berkala lewat scheduled job.

Untuk jumlah aplikasi yang masih sedikit (3–5 aplikasi), pendekatan pull lebih sederhana diimplementasikan dan cukup akurat. Push lebih relevan kalau jumlah aplikasi anak sudah banyak.

### 12.3 Data model

Tabel `app_health_logs` (`id`, `app_id`, `status`, `response_time_ms`, `checked_at`).

### 12.4 Tampilan & alert

Dashboard admin menampilkan status terkini (up/down), persentase uptime, dan waktu cek terakhir. Bisa ditambahkan alert otomatis (lewat Notification Hub sendiri — dogfooding fitur bagian 7) kalau satu aplikasi down lebih dari N menit berturut-turut.

---

## 13. Fase 10: Audit Log Aggregator Lintas Aplikasi

### 13.1 Prinsip

Perluasan dari audit log Ecopa sendiri (Fase 4, bagian 6). Fase ini mengagregasi log aktivitas penting dari aplikasi anak juga, supaya ada satu tempat audit trail lintas ekosistem untuk kebutuhan kepatuhan dan investigasi.

### 13.2 Kontrak API

```
POST /api/audit-logs
Authorization: Bearer <client_credentials_token>

Body:
{
  "app_id": "akunta",
  "actor_user_id": "<ecopa_sub>",
  "action": "invoice.approved",
  "subject_type": "invoice",
  "subject_id": "INV-001",
  "meta": { "amount": 5000000 },
  "occurred_at": "2026-07-31T10:00:00Z"
}
```

### 13.3 Data model

Tabel `audit_logs` yang sudah ada di Fase 4 diperluas dengan kolom `source_app_id` (nullable — `null` berarti aksi dari Ecopa sendiri, terisi berarti dikirim dari aplikasi anak).

### 13.4 Batasan

Aplikasi anak menentukan sendiri aksi mana yang dianggap penting untuk dikirim — jangan kirim seluruh log aktivitas (terlalu berat untuk Ecopa menampung), cukup aksi yang berdampak signifikan: perubahan data finansial, penghapusan data, keputusan approval.

### 13.5 Tampilan

Halaman admin Ecopa menyediakan filter log berdasarkan aplikasi asal, jenis aksi, dan rentang waktu — satu tempat untuk audit trail lintas ekosistem.

---

## 14. Batasan tanggung jawab (jangan dilanggar agent)

- Ecopa **tidak menyimpan** data operasional aplikasi anak (data akuntansi, data presensi, data proyek). Ecopa hanya mengurus identitas dan akses.
- Aplikasi anak **tidak boleh** dianggap sebagai sumber kebenaran untuk keanggotaan divisi/organisasi — itu tanggung jawab Ecopa.
- Jangan hardcode daftar aplikasi anak di kode Ecopa — semua harus melalui tabel `apps` supaya aplikasi baru bisa didaftarkan tanpa deploy ulang Ecopa.
- Jangan buat aplikasi anak saling terhubung langsung satu sama lain untuk urusan identitas — semua harus lewat Ecopa sebagai hub, bukan mesh peer-to-peer.
- Aplikasi anak tidak boleh mengimplementasikan pengiriman email notifikasi sendiri (SMTP terpisah) untuk komunikasi ke user — semua permintaan notifikasi email harus lewat API Notification Hub Ecopa (bagian 7).
- Data organisasi (divisi, jabatan, cost center, nomor pegawai) tidak boleh dianggap milik aplikasi anak — Ecopa adalah sumber kebenarannya (bagian 9). Aplikasi anak hanya boleh cache, tidak boleh jadi tempat edit master data.
- Jangan kirim seluruh log aktivitas aplikasi anak ke audit log aggregator Ecopa (bagian 13) — hanya aksi yang berdampak signifikan, supaya sistem tidak kebanjiran data yang tidak berguna untuk audit.
