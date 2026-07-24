# Module Spec — Productivity Dashboard

## Status: Approved | Fase: 2

## Tujuan
Memberikan visibilitas kepada supervisor/manager atas produktivitas individu dan tim,
berbasis data yang sudah ada di sistem (time tracking, task completion, review outcome)
tanpa input manual tambahan dari staff.

## User Stories
- Sebagai Supervisor, saya ingin melihat jumlah task selesai per staff per minggu, agar
  saya bisa mengidentifikasi beban kerja yang tidak seimbang.
- Sebagai Manager, saya ingin melihat rata-rata waktu penyelesaian task per tipe project,
  agar saya bisa estimasi timeline project baru lebih akurat.
- Sebagai Admin, saya ingin export dashboard ke PDF untuk laporan bulanan ke atasan.

## Metrik Wajib (MVP)
| Metrik | Sumber Data | Granularitas |
|---|---|---|
| Task completed count | `tasks.status = done` | per user, per team, per minggu/bulan |
| Average task duration | `time_entries` (sum durasi per task) | per user, per tipe task |
| On-time vs late completion | `tasks.due_date` vs `completed_at` | per user, per team |
| Review pass rate | `reviews.status = approved` / total reviews | per user |
| Active project count | `projects.status = active` | per team |

## Non-Goals (MVP)
- Tidak ada gamification (leaderboard, badge) — berisiko menimbulkan tekanan kompetitif
  yang tidak sehat antar staff. Jika diinginkan di masa depan, harus jadi keputusan sadar,
  bukan default.
- Tidak ada real-time streaming metric — cukup refresh on-demand atau cache 5 menit.

## API Terkait
- `GET /api/v1/dashboard/productivity?team_id=&from=&to=`
- `GET /api/v1/reports/productivity?format=pdf` (lihat 02-api-specification.md §5.5)

## Acceptance Criteria
1. Dashboard menampilkan data minimal 4 metrik di atas dengan filter rentang tanggal dan
   team.
2. Data yang ditampilkan konsisten dengan data mentah di `time_entries`/`tasks` — tidak
   ada agregasi ganda saat task dipindah antar sub-project.
3. Export PDF menghasilkan layout yang sama persis dengan tampilan dashboard (bukan raw
   table tanpa styling).
