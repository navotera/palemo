# Module Spec — Time Tracking

## Status: Approved | Fase: 1

## Tujuan
Mengukur waktu pengerjaan task secara akurat sebagai dasar Productivity Dashboard, tanpa
bergantung pada input manual yang mudah dimanipulasi.

## Entity
Lihat `01-domain-model.md §2.10` (`time_entries`).

## Aturan Bisnis
- Satu user hanya boleh punya **satu** `time_entry` aktif (belum `ended_at`) di satu
  waktu — mencegah tracking dobel di beberapa task bersamaan.
- `duration_seconds` dihitung server-side dari `ended_at - started_at`, tidak menerima
  input manual dari klien.
- Jika user lupa stop timer (`started_at` lebih dari 12 jam tanpa stop), sistem
  auto-stop dan menandai entry dengan flag `auto_closed = true` agar bisa direview
  manual (bukan dihitung sebagai jam kerja valid tanpa verifikasi).

## API Terkait
```
POST /api/v1/time-entries/start   { "task_id": "uuid" }
POST /api/v1/time-entries/stop    { "time_entry_id": "uuid" }
GET  /api/v1/time-entries?user_id=&from=&to=
```

## Acceptance Criteria
1. Start timer baru otomatis stop timer sebelumnya jika user lupa stop manual (dengan
   notifikasi/warning ke user, bukan silent).
2. Data `time_entries` yang `auto_closed = true` ditandai berbeda secara visual di
   dashboard, dan bisa di-exclude dari perhitungan Productivity Dashboard bila
   diperlukan.
3. Total durasi per task/project bisa diagregasi tanpa perlu recompute ulang seluruh
   history — pertimbangkan materialized view atau cache agregat harian.
