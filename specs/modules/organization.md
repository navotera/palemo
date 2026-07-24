# Module Spec — Organization Management

## Status: Approved | Phase: Foundation

## Purpose
Allow authorized tenant administrators to manage the Company → Division → Team hierarchy used by project ownership and executive reporting.

## Endpoints

- `GET /api/v1/divisions` — list divisions and their teams for the active tenant.
- `POST /api/v1/divisions` — create a division, optionally with an initial team.

Create body:

```json
{
  "name": "Operations",
  "parent_division_id": null,
  "initial_team_name": "Operations Core"
}
```

## Business Rules

- Only user sessions with role `admin` or `manager` may create a division.
- Division names are unique within a tenant, case-insensitively.
- A parent division, when supplied, must belong to the same tenant.
- `initial_team_name` is optional; when supplied, the team is created atomically with the division.
- Every create request requires `Idempotency-Key` and writes an audit event.

## Acceptance Criteria

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
