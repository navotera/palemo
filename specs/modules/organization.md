# Module Spec — Organization Management

## Status: Approved | Phase: Foundation

## Purpose
Allow authorized tenant administrators to manage the Company → Division → Team hierarchy used by project ownership and executive reporting.

## Endpoints

Divisions and Teams are distinct organizational concepts. Divisions own direct memberships;
Teams may participate in multiple Divisions and contain multiple users.

Additional relationship endpoints:

- `PUT /api/v1/divisions/{id}/members` replaces direct Division membership.
- `PUT /api/v1/teams/{id}/divisions` replaces the Team's participating Divisions.
- `PUT /api/v1/teams/{id}/members` replaces the Team's users.

- `GET /api/v1/divisions` — list divisions and their teams for the active tenant.
- `POST /api/v1/divisions` — create a division, optionally with an initial team.
- `PATCH /api/v1/divisions/{id}` — update a division name, color, or icon (admin only).
- `PATCH /api/v1/teams/{id}` — update a team name, color, or icon (admin only).

Create body:

```json
{
  "name": "Operations",
  "parent_division_id": null,
  "initial_team_name": "Operations Core",
  "color": "#3b9a68",
  "icon": "🏢"
}
```

## Business Rules

- Only user sessions with role `admin` or `manager` may create a division.
- Division names are unique within a tenant, case-insensitively.
- A parent division, when supplied, must belong to the same tenant.
- `initial_team_name` is optional; when supplied, the team is created atomically with the division.
- `color` is a required six-digit hexadecimal color. `icon` is an optional emoji or Unicode icon limited to 16 characters. Defaults remain `#3b9a68` and `🏢` for backward compatibility.
- Every create request requires `Idempotency-Key` and writes an audit event.
- Division updates are admin-only, tenant-scoped, and audited with before/after state.
- Teams support the same validated color and Unicode icon fields as divisions. Team updates are admin-only, tenant-scoped, and audited.

## Acceptance Criteria

- Division responses return direct `member_ids` and linked `team_ids` independently.
- Team responses return `division_ids` and `member_ids`; linking a Team to another Division does not remove its existing links.
- Division membership is never inferred from Team membership.
- Relationship mutations are tenant-scoped, bounded to 100 IDs, transactional, and audited with before/after IDs.

- The organization page lists only divisions belonging to the signed-in tenant.
- Replaying the same create request with the same idempotency key does not create duplicates.
- Reusing an idempotency key with a different payload returns `409 CONFLICT`.
- A cross-tenant parent division is rejected without revealing that it exists.
- Successful creation is recorded in `audit_events` with the actor and created division.

## Division Lead Delegation

- `PUT /api/v1/divisions/{id}/leads` replaces the explicit division leads.
- Tenant admins are responsible for every division by default and need no mapping row.
- Only an admin may assign explicit division leads.
- A division lead may add users only to teams belonging to their division.
- Lead users and divisions must belong to the same tenant; every change is audited.
- `GET /api/v1/divisions` returns `lead_user_ids` for explicit leads.
