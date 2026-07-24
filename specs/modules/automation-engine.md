# Module Spec — Automation Engine

## Status: Draft | Fase: 5

## Tujuan
Menyediakan rule engine generik ("jika X terjadi, lakukan Y") di dalam NPMS, terpisah
dari Integration Framework yang menangani trigger/webhook lintas sistem eksternal.

## Perbedaan dengan Integration Framework
- **Integration Framework** = komunikasi API antar sistem (NPMS ↔ WordPress, GitHub, dst).
- **Automation Engine** = logic otomatisasi *internal* NPMS berbasis rule yang bisa
  dikonfigurasi user tanpa coding, mis. "jika semua checklist item di task selesai, ubah
  status task ke review otomatis" atau "jika task overdue > 3 hari, kirim notifikasi ke
  supervisor".

## Entity
### `automation_rules`
| Field | Tipe | Ket |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | FK |
| trigger_event | string | mis. `task.checklist_completed`, `task.overdue` |
| condition_json | jsonb | kondisi tambahan, mis. `{"project_tag": "urgent"}` |
| action_type | enum | `change_status`, `send_notification`, `create_task`, `assign_review` |
| action_config_json | jsonb | konfigurasi aksi |
| is_active | boolean | |

## Alur Eksekusi
```
Event terjadi (mis. checklist_item toggled done)
        ↓
Engine cek apakah semua checklist_items di task tsb sudah done
        ↓
Jika ya → publish event `task.checklist_completed`
        ↓
Automation Engine mencocokkan rule aktif → eksekusi action
        ↓
Dicatat di audit_events (source: "automation_engine", rule_id: ...)
```

## Non-Goals (MVP fase ini)
- Tidak membangun visual rule builder (drag-drop UI) di rilis pertama — cukup form
  sederhana (dropdown trigger + dropdown action). Visual builder bisa menyusul jika
  adopsi rule cukup tinggi.

## Acceptance Criteria
1. Rule yang tidak aktif (`is_active = false`) tidak dieksekusi tapi tetap tersimpan.
2. Loop tak terhingga dicegah: aksi dari satu rule tidak boleh langsung memicu trigger
   event yang sama tanpa batas (tambahkan max depth/iterasi guard).
3. Setiap eksekusi rule tercatat di audit trail dengan referensi `rule_id` agar bisa
   ditelusuri kenapa suatu perubahan terjadi otomatis.
