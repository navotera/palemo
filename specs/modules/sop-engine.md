# Module Spec — SOP Engine

## Status: Draft | Fase: 5

## Tujuan
Mengubah SOP (Standard Operating Procedure) dari dokumen statis di Wiki menjadi checklist
yang bisa otomatis di-attach ke project/task berdasarkan tipe pekerjaan.

## Relasi dengan Knowledge Management
SOP Engine **bergantung** pada `sop_repository` (bagian dari Knowledge Management, lihat
`knowledge-management.md`) sebagai sumber definisi SOP. SOP Engine hanya menangani logic
"kapan dan bagaimana SOP tersebut di-attach sebagai checklist ke entity kerja".

## Entity Tambahan
### `sop_triggers`
| Field | Tipe | Ket |
|---|---|---|
| id | uuid | PK |
| sop_id | uuid | FK → sop_repository |
| trigger_type | enum | `project_created`, `task_type_matched`, `manual` |
| condition_json | jsonb | kondisi pemicu, mis. `{"project_tag": "client-onboarding"}` |

## Alur
```
Project/Task dibuat dengan tag/tipe tertentu
        ↓
SOP Engine mencocokkan `condition_json` yang relevan
        ↓
Jika cocok → checklist_items digenerate dari SOP steps
        ↓
Dicatat di audit_events (source: "sop_engine", bukan user manual)
```

## Acceptance Criteria
1. SOP yang berubah di Wiki **tidak** otomatis mengubah checklist yang sudah ter-generate
   di project berjalan (snapshot, bukan live reference) — mencegah checklist berubah
   tiba-tiba di tengah pengerjaan.
2. User bisa melihat SOP versi berapa yang menjadi sumber checklist tertentu (audit trail
   ke `sop_repository` versi tersebut).
