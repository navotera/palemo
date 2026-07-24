# Palemo / NPMS Agent Instructions

These instructions apply to the entire repository and must be followed by every AI agent and future development session.

## Required context

Before changing application code, read:

1. `specs/00-vision-architecture.md`
2. `specs/05-security-performance-standards.md`
3. The relevant module specification under `specs/modules/`

For REST endpoints, database changes, or tests, also follow the applicable NPMS skills and the conventions in `specs/02-api-specification.md` and `specs/03-tech-stack.md`.

## Non-negotiable rules

- Preserve tenant isolation in every query and mutation. Never trust tenant, actor, role, or ownership identifiers supplied by the client.
- Enforce authorization on the backend. Hiding or disabling a frontend control is not authorization.
- Record auditable business mutations with actor, tenant, entity, request ID, before/after state where applicable, and timestamp.
- Require idempotency for retryable create/action endpoints.
- Validate and normalize all external input. Render user content safely and never expose secrets in logs, responses, source code, or browser storage.
- Avoid unbounded reads, N+1 queries, unnecessary rerenders, and synchronous heavy work on interactive paths.
- Do not weaken security or performance controls to make a feature pass.
- Preserve user-owned changes and existing API contracts unless the task explicitly authorizes a breaking change.

## Definition of done

A feature is not complete until the Security and Performance Feature Checklist in `specs/05-security-performance-standards.md` has been evaluated. Run checks proportional to the change, including type checking, relevant tests, syntax/lint checks, and a production build for frontend changes. Report known warnings or exceptions instead of silently ignoring them.