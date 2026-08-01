# Module Spec — Review Workflow

## Status: Approved | Fase: 2

## Tujuan
Memungkinkan supervisor melakukan review formal terhadap task/milestone/project sebelum
dianggap selesai, sebagai mekanisme quality gate — bukan sekadar checklist selesai/belum.

## Entity
Lihat `01-domain-model.md §2.11` (`reviews` table).

## Alur
```
Task/Milestone/Project mencapai status "review requested"
        ↓
Sistem membuat record `reviews` (status: pending) + assign ke reviewer
        ↓
Reviewer approve / reject / request_revision
        ↓
Jika approved  → entity status lanjut ke "done"
Jika rejected  → entity status kembali ke "in_progress", notifikasi ke assignee
Jika revision  → entity tetap "in_progress", catatan revisi ditambahkan ke notes
```

## Aturan Bisnis
- Reviewer **tidak boleh** sama dengan assignee task tersebut (self-review dilarang),
  kecuali role `admin` secara eksplisit override.
- Setiap perubahan status review dicatat ke `audit_events`.
- Notifikasi wajib dikirim ke assignee saat status review berubah (lihat
  `integration-framework.md` untuk mekanisme notifikasi/webhook).

## API Terkait
- `POST /api/v1/reviews`
- `PATCH /api/v1/reviews/{id}`
- `GET /api/v1/reviews?entity_type=&entity_id=`

Project Preliminary Notes provides separate User Note and Reviewer Note tabs. Reviewer Note
is stored on the project and may only be changed by a user already assigned as that project's
reviewer; UI visibility or a reviewer assignment submitted in the same request is not sufficient
authorization. The mutation remains tenant-scoped and audited through project update.

## Acceptance Criteria
1. Task tidak bisa berpindah ke status `done` tanpa review approved, jika project/team
   tersebut mengaktifkan `require_review = true` (setting per team, bukan global).
2. Reviewer mendapat notifikasi saat ada review baru masuk ke antriannya.
3. History semua review (termasuk yang rejected) tetap tersimpan dan terlihat di
   timeline task — tidak overwrite record lama.
