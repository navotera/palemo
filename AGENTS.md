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

Verification must remain proportional to the requested change. For simple revisions, unrelated or redundant verification activities may be skipped; they must not be performed as a routine requirement merely because they are available. In particular, `npm run build` may be skipped for small UI, CSS, copy, or isolated frontend logic changes when dependencies, build configuration, entry points, routing, code splitting, and bundle-sensitive behavior are unchanged. Run it only when the change or the applicable checklist makes it necessary or mandatory. The same rule applies to unrelated tests or checks such as `activities2`.

## Efficient verification workflow

Use incremental checks during implementation so feedback remains fast while preserving the Definition of Done:

- For a small CSS-only change, inspect the focused diff and validate the affected stylesheet; do not run a production build after every individual edit.
- For a small TypeScript change, run the TypeScript check first. Add focused tests when behavior or business logic changes.
- When several related frontend edits are requested consecutively, batch them and run one production build at the end of the feature or at a meaningful checkpoint.
- Run a production build immediately when changing dependencies, build configuration, Vite configuration, code splitting, entry points, or other bundle-sensitive behavior.
- Before declaring a frontend feature complete, run the required production build once and report any warnings or exceptions.
- Do not repeat server, dependency, or unrelated test checks when the current change cannot affect them.
- Prefer the narrowest relevant check during iteration, then perform the complete proportional verification at final handoff.
