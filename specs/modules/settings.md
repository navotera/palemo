# Module Spec — Workspace Settings

## Status: Approved | Phase: Foundation

## Purpose

Provide one tenant-scoped Settings area for the master data used by project creation:
project types, configurable project metadata fields, users and their roles, and the
division/team hierarchy.

## Endpoints

- `GET /api/v1/settings/general`
- `PATCH /api/v1/settings/general`
- `GET /api/v1/settings/workspace-tabs`
- `PUT /api/v1/settings/workspace-tabs`
- `POST /api/v1/settings/simulation`
- `DELETE /api/v1/settings/simulation`

- `GET /api/v1/settings/project-types`
- `POST /api/v1/settings/project-types`
- `GET /api/v1/settings/project-metadata-fields`
- `POST /api/v1/settings/project-metadata-fields`
- `POST /api/v1/settings/users`
- `GET /api/v1/settings/knowledge-types`
- `POST /api/v1/settings/knowledge-types`
- `PATCH /api/v1/settings/knowledge-types/{id}`

Division and team management continues to use `/api/v1/divisions` so organization data
has one canonical API.

## Business Rules

- All records and queries are scoped to the active tenant.
- Only `admin` and `manager` users may mutate Settings master data.
- Project type names and metadata field keys are unique within a tenant,
  case-insensitively.
- Built-in project types are Operational, Technical, and R&D; Operational remains the
  default. Tenant-defined types are reusable in every New Project form.
- Metadata field types are `text`, `number`, `date`, `boolean`, or `select`. Select fields
  require at least one option. Values are persisted in the project's existing `metadata`
  JSON object using the configured key.
- User roles remain the controlled platform roles: `admin`, `manager`, `supervisor`, and
  `staff`. A new user must belong to a team in the same tenant.
- Every create request requires `Idempotency-Key` and records an audit event in the same
  transaction.

## Acceptance Criteria

- The Settings menu is visible in the main navigation and opens the four management areas.
- A custom Project Type created in Settings appears in New Project without a reload.
- A configured metadata field appears in New Project and its value is included in project
  metadata on creation.
- A user created with a selected team and role appears in project member/reviewer selectors.
- Division management remains available from Settings and continues to enforce tenant
  isolation.
- Duplicate master-data names/keys are rejected and create endpoints are idempotent and
  audited.


- Knowledge types configure the label, color, order, and active state of the four controlled knowledge submodules. Disabled types are hidden from the Knowledge Management list; their historical content is retained.

- Admins and managers may create custom KB types. Slugs are generated server-side and unique per tenant. Custom types use the generic wiki-page content model while remaining isolated by knowledge_type_id.

- General settings include knowledge_visible_type_limit (1-10, default 3). Knowledge Management shows that many active KB types directly and moves the remainder into a More dropdown.

- Simulation load is admin-only and idempotent per tenant while an active batch exists. Every generated entity is registered in simulation_records. Delete only targets registered simulation entities, uses soft delete for projects/tasks/knowledge, retains audit history, and never deletes organization master data.

- Every simulation-owned domain row carries nullable simulation_batch_id FK. User-created rows always keep this field NULL and are excluded from simulation cleanup, including rows created while a simulation batch is active. Default simulation volume is 30 projects, 90 tasks, 180 checklist items, and 10 entries per active KB type.

- If a tenant has no knowledge workspace, the simulator creates one FK-marked simulation workspace, fills every active KB type, and soft-deletes that workspace during cleanup.

- General workspace_tab_limit is admin/manager configurable from 1 to 12 (default 8). Each user persists their own sanitized open-tab descriptors and active tab in user_workspace_states; tab state is restored on the next login and never shared across users or tenants.

- General theme_tone is tenant-scoped and restricted to forest, ocean, indigo, terracotta, or slate. The selected tone changes application chrome and primary accents while semantic success, warning, and error colors remain stable.

- Gradient theme presets gradient_aurora, gradient_ocean, and gradient_sunset may be selected. Gradients apply to navigation chrome and primary accents only; content surfaces stay neutral for readability.

- Custom theme supports solid or gradient mode, validated hexadecimal primary/secondary colors, and a gradient angle from 0 to 360 degrees. Custom theme settings are tenant-scoped and admin/manager controlled.

- Editor mode preference is stored per user (isual or markdown) and reused as the default across rich-text editors.
- GET/PATCH /api/v1/settings/editor-preference reads or updates the current user's preference.
