# 01 â€” Domain Model & Hierarchy

## Status: Approved
## Versi: 1.0

## 1. Hierarki Organisasi

```
Company (tenant root)
 â””â”€ Division
     â””â”€ Team
         â””â”€ Portfolio (opsional, grouping antar project)
             â””â”€ Project
                 â””â”€ Sub Project (opsional, nested)
                     â””â”€ Milestone
                         â””â”€ Sprint (opsional, untuk tim yang pakai agile)
                             â””â”€ Task
                                 â””â”€ Checklist Item
```

Catatan implementasi: Portfolio & Sprint bersifat **opsional** â€” Project bisa langsung
di bawah Team tanpa Portfolio, dan Task bisa langsung di bawah Milestone tanpa Sprint.
Gunakan nullable foreign key, jangan wajibkan hierarki penuh.

## 2. Entity Utama

### 2.1 `tenants`
| Field | Tipe | Ket |
|---|---|---|
| id | uuid | PK |
| name | string | |
| created_at | timestamp | |

### 2.2 `divisions`
| Field | Tipe | Ket |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | FK â†’ tenants |
| name | string | |
| parent_division_id | uuid nullable | self-referencing, untuk sub-divisi |

### 2.3 `teams`
| Field | Tipe | Ket |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | FK |
| division_id | uuid | FK |
| name | string | |

### 2.4 `users`
| Field | Tipe | Ket |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | FK |
| external_id | string nullable | ID user di sistem SSO eksternal |
| name, email | string | |
| role | enum | `admin`, `manager`, `supervisor`, `staff` |
| team_id | uuid nullable | FK |
| profile_image, profile_image_content_type, profile_image_size_bytes | bytea/string/integer nullable | Private user avatar; JPEG, PNG, or WebP up to 2 MB |

### 2.5 `portfolios`
| Field | Tipe | Ket |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | FK |
| team_id | uuid | FK |
| name | string | |

### 2.6 `projects`
| Field | Tipe | Ket |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | FK |
| portfolio_id | uuid nullable | FK |
| team_id | uuid | FK |
| parent_project_id | uuid nullable | self-referencing â†’ Sub Project |
| name | string | |
| project_type | string | `operational` (default), `technical`, `rnd`, or a custom label |
| tags | string[] | user-defined project labels, deduplicated case-insensitively |
| preliminary_note_template_id | uuid nullable | FK to the saved preliminary-note source |
| preliminary_notes | text | editable Markdown/HTML snapshot used at project creation |
| status | enum | `planning`, `active`, `on_hold`, `review`, `done`, `archived` |
| template_id | uuid nullable | FK â†’ project_templates, sumber checklist awal |
| source | string nullable | asal trigger, mis. `api:woocommerce`, `manual` |
| source_ref | string nullable | ID referensi di sistem sumber (mis. WooCommerce order ID) |
| created_at, updated_at | timestamp | |

Project Definition exposes Project Preliminary Notes. Users may write Markdown directly or
load a tenant-scoped `preliminary_note_templates` record and continue editing the loaded
snapshot without changing the source template.

### 2.6.2 Project settings master data

Tenant-scoped `project_types` records provide reusable custom classification labels and
display colors. Tenant-scoped `project_metadata_fields` records define reusable New Project
inputs (`text`, `number`, `date`, `boolean`, or `select`). Submitted values are stored in the
existing `projects.metadata` JSONB object by `field_key`; field definitions are never copied
into the project row.

### 2.6.1 `preliminary_note_templates`
| Field | Type | Description |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | owning tenant |
| name | string | unique within tenant |
| content_markdown | text | reusable preliminary-note content |
| created_at, updated_at | timestamp | |

### 2.7 `milestones`, `sprints`, `tasks`
Struktur serupa `projects` dengan FK berjenjang. `tasks` memiliki tambahan:
| Field | Tipe | Ket |
|---|---|---|
| assignee_id | uuid nullable | FK â†’ users |
| board_column | string | untuk fitur Trello-like (`todo`, `in_progress`, `review`, `done`, custom) |
| position | integer | urutan dalam kolom (drag-drop) |
| due_date | date nullable | |
| estimated_hours | decimal nullable | |

### 2.8 `checklist_items`
| Field | Tipe | Ket |
|---|---|---|
| id | uuid | PK |
| task_id | uuid | FK |
| label | string | |
| is_done | boolean | |
| order | integer | |

### 2.9 `project_templates`
| Field | Tipe | Ket |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | FK |
| name | string | |
| source_project_id | uuid nullable | jika template disalin dari project berjalan |
| structure_json | jsonb | snapshot milestone/task/checklist untuk di-clone |

### 2.10 `time_entries`
| Field | Tipe | Ket |
|---|---|---|
| id | uuid | PK |
| task_id | uuid | FK |
| user_id | uuid | FK |
| started_at, ended_at | timestamp | |
| duration_seconds | integer | dihitung, bukan diinput manual (anti-manipulasi) |

### 2.11 `reviews` (Review Workflow)
| Field | Tipe | Ket |
|---|---|---|
| id | uuid | PK |
| entity_type | enum | `task`, `milestone`, `project` |
| entity_id | uuid | |
| reviewer_id | uuid | FK â†’ users |
| status | enum | `pending`, `approved`, `rejected`, `revision_requested` |
| notes | text nullable | |
| created_at | timestamp | |

### 2.12 `audit_events`
| Field | Tipe | Ket |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | FK |
| actor_id | uuid nullable | null jika triggered by system/API |
| actor_source | string | `user`, `api:{connector_name}`, `system` |
| action | string | `create`, `update`, `delete`, `status_change`, dst |
| entity_type, entity_id | string, uuid | |
| before_json, after_json | jsonb nullable | |
| created_at | timestamp | |

### 2.13 Knowledge Management: `workspaces`, `wiki_pages`, `meeting_notes`, `decision_logs`, `lessons_learned`
Semua mengikuti pola dasar: `tenant_id`, `team_id` nullable (bisa company-wide), `title`,
`content` (rich text/markdown), `author_id`, `created_at`, `updated_at`, `tags` (array).
`wiki_pages` tambahan mendukung `parent_page_id` untuk struktur nested seperti Notion.

### 2.14 Integration: `api_clients`, `webhook_subscriptions`, `idempotency_keys`
Detail penuh di `specs/modules/integration-framework.md`.

## 3. Catatan Desain

- Semua entity domain **wajib** memiliki `tenant_id`, kecuali tabel global (`api_clients`
  bisa lintas tenant jika NPMS jadi SaaS multi-klien).
- Soft delete (`deleted_at`) digunakan untuk `projects`, `tasks`, `wiki_pages` â€” jangan hard
  delete karena berkaitan dengan Audit Trail.
- Gunakan UUID v7 (time-ordered) bila database mendukung, agar index tetap efisien.

### Project collaboration links
A project retains one primary owning `team_id`. Cross-division participation is stored in
`project_divisions`; linked Knowledge Management wiki pages are stored in
`project_knowledge_links`. Both link tables are tenant-scoped and reject cross-tenant references.

### Flexible project people and review gate
`project_people` assigns optional `member` and `reviewer` roles. Work Finish is a workflow
gate, not completion: projects with reviewers transition to `review` and create one pending
review per reviewer; projects without reviewers transition directly to `done`.

Project division participation is derived automatically from the primary responsible team and
the teams of selected project members. The create UI must not ask users to duplicate this data.

### Division lead delegation

`division_leads` is a tenant-scoped many-to-many assignment between divisions and users.
It grants delegated user-management authority within teams of that division. Tenant admins
are implicit responsible people for every division and therefore do not need mapping rows.
