# KPI Monitoring — PRD & Konteks Pengembangan

> **Status: PROTOTIPE FRONTEND SAJA — JANGAN DIJALANKAN / DIRILIS DULU.**
> Fitur ini masih UI mock (data dummy, belum ada backend). Pemilik produk meminta
> pengembangan dihentikan sementara dan arahnya didokumentasikan dulu di sini
> sebelum lanjut coding.
>
> Dokumen ini adalah sumber konteks untuk sesi/berikutnya. Baca ini lebih dulu
> sebelum menyentuh kode KPI.

## 1. Tujuan

KPI monitoring dibuat agar:

- **Supervisor dapat dinilai** kinerjanya (seberapa baik ia menetapkan target &
  membina timnya).
- **Staff dapat dilihat kinerjanya** (pencapaian terhadap target mingguan).

Intinya: alat pemantauan kinerja dua arah — menilai supervisor sekaligus
memperlihatkan performa staff.

## 2. Prinsip desain

- **Fokus pada kemudahan (ease of use).** Entri cepat pakai inline edit; pop-up
  hanya untuk edit detail yang disengaja. Hindari interupsi modal pada aksi
  create utama. (Lihat memori proyek: "UX: prioritize ease of use".)

## 3. Yang sudah dibangun (prototipe saat ini)

Lokasi kode: [`web/src/WeeklyKpi.tsx`](../web/src/WeeklyKpi.tsx) +
[`web/src/weekly-kpi.css`](../web/src/weekly-kpi.css). Dipasang di `App.tsx`
(`view === "weekly-kpi"`). **Semua data masih lokal/dummy — belum menyentuh
backend.**

Mode yang ada: **"KPI Saya"** (sudut pandang staff).

### Model minggu
- **Minggu berjalan (`active`)** → grid bisa diedit, autosave (mock).
- **Minggu lampau (`locked`)** → read-only. Staff bisa "Minta izin edit" ke
  supervisor → status `pending`.
- Pemilih minggu via mini-kalender; badge jumlah aktivitas per minggu.

### Daftar aktivitas (pola ala Trello)
- **Tambah aktivitas = inline editor** di baris baru (autofocus). `Enter` lanjut
  ke baris berikutnya; baris kosong auto-hapus saat blur.
- **Klik nama**: jika nama masih kosong → aktifkan input inline; jika sudah
  bernama → buka **pop-up kartu detail**.
- **Status = badge berwarna** + ikon chevron; klik membuka menu pilih status.
  Status saat ini: `not_started` (Belum mulai), `in_progress` (Berjalan),
  `done` (Selesai), `blocked` (Terblokir).
- **Chip ringkas** di kanan nama: jumlah checklist & jumlah lampiran.

### Kartu detail aktivitas (pop-up)
- Edit nama, status, catatan/deskripsi.
- **Checklist** penyelesaian (tambah/centang/hapus) + bar progres.
- **Lampiran**: unggah berkas (multiple). Gambar tampil sebagai **thumbnail**,
  klik → **lightbox** pratinjau + tombol unduh. Non-gambar buka di tab baru.
- **Audit trail**: riwayat perubahan (nama/status/catatan/checklist/lampiran).
  Perubahan beruntun pada field sama digabung jadi satu entri.
- Tombol **Hapus aktivitas**.

### Ringkasan & review
- Kartu penyelesaian (% minggu ini), target dari supervisor (read-only),
  catatan review supervisor dengan rating bintang.

### Keterbatasan prototipe (penting untuk diingat)
- Tidak ada API / persistensi. Refresh = data hilang.
- Lampiran hanya `URL.createObjectURL` (di memori browser).
- Belum ada autentikasi, peran (role), tenant isolation, atau audit backend.
- Belum ada di `specs/modules/` — butuh spesifikasi modul resmi saat
  diformalkan.

## 4. Penambahan yang diminta (roadmap)

1. **Mindmap target (visual, untuk supervisor).**
   Hierarki target: **tahunan → semester / 3-bulanan → mingguan** (yang dicapai
   staff). Supervisor menyusun peta ini; target mingguan staff terhubung ke
   target di atasnya.

2. **Penundaan aktivitas.**
   Cukup perubahan status baru (mis. `postponed` / "Ditunda") dengan **warna
   abu-abu (grey)**. Tambahkan ke enum status aktivitas.

3. **Pandangan tim (untuk supervisor, dan untuk sementara admin).**
   Menampilkan **jumlah staff dalam tim** dan **aktivitas yang dijalankan
   minggu ini dalam bentuk tabel beserta pencapaiannya**.

4. **Laporan performa (performance report).**
   Laporan **bulanan dan tahunan** — yang sudah selesai dan yang belum selesai.

## 5. Catatan untuk implementasi backend (saat lanjut nanti)

Wajib mengikuti `AGENTS.md` dan standar proyek:

- Baca dulu: `specs/00-vision-architecture.md`,
  `specs/05-security-performance-standards.md`, dan modul terkait di
  `specs/modules/` (mis. `productivity-dashboard.md`, `review-workflow.md`,
  `organization.md`, `audit-trail.md`, `time-tracking.md`).
- **Tenant isolation** di setiap query/mutation; jangan percaya identitas
  tenant/aktor/role/kepemilikan dari klien.
- **Otorisasi di backend** (menyembunyikan kontrol frontend ≠ otorisasi).
- **Audit trail** tercatat: aktor, tenant, entitas, request id, state
  sebelum/sesudah, timestamp.
- **Idempotency** untuk endpoint create/action yang retryable.
- Validasi & normalisasi input; hindari unbounded reads & N+1.

## 6. Pertanyaan/keputusan terbuka

- **Model data target berjenjang** (tahunan/semester/mingguan) dan relasi
  aktivitas mingguan → target di atasnya.
- **Peran & hak akses**: staff / supervisor / admin — siapa menetapkan target,
  siapa mereview, siapa melihat tabel tim & laporan.
- **Persistensi & penyimpanan lampiran** (storage, batas ukuran, tipe).
- **Status "Ditunda"**: penamaan final + perlakuan di perhitungan pencapaian.
- **Laporan**: sumber agregasi, batas periode (bulan/tahun), ekspor.
- **Penilaian supervisor**: metrik apa yang membuat supervisor "dinilai".
