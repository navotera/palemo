# NPMS Security and Performance Standards

Status: Mandatory repository requirement  
Applies to: frontend, API, workers, database, integrations, migrations, simulation data, and AI-generated changes  
Last updated: 2026-07-24

## 1. Purpose

Every new feature and modification must be secure by default, tenant-safe, auditable, and performant at realistic workspace scale. These requirements are acceptance criteria, not optional recommendations.

When a requirement cannot be met, document the exception, risk, compensating control, owner, and follow-up work before shipping.

## 2. Security requirements

### 2.1 Authentication and authorization

- Authenticate protected endpoints through the standard NPMS middleware.
- Authorize every mutation and sensitive read on the backend using role, ownership, division/team responsibility, and resource state as applicable.
- Treat frontend visibility, disabled buttons, and route guards only as usability controls.
- Deny by default. Return consistent `401`, `403`, and `404` responses without leaking cross-tenant resource existence.
- Re-check authorization when moving a resource between teams, divisions, projects, or owners.

### 2.2 Tenant isolation

- Every tenant-owned query, update, delete, relationship lookup, uniqueness check, and audit lookup must include the authenticated `tenant_id`.
- Derive `tenant_id` and actor identity from the authenticated principal, never request bodies or query parameters.
- Validate that every referenced entity belongs to the same tenant before writing relationships.
- Add composite tenant-aware constraints and indexes where they enforce ownership or uniqueness.
- Tests for tenant-owned features must include a cross-tenant denial case.

### 2.3 Input, output, and content safety

- Validate types, lengths, formats, enums, array sizes, nesting depth, and required fields at the API boundary.
- Normalize identifiers and text before uniqueness checks. Reject unexpected writable fields (mass-assignment protection).
- Escape rendered text by default. Sanitize permitted rich HTML using an allowlist; Markdown output must not permit scripts, event handlers, unsafe URLs, or arbitrary embeds.
- Protect spreadsheet exports from formula injection and generated filenames from path traversal.
- Uploads require size limits, extension and MIME verification, randomized storage names, authorization on download, and malware scanning when externally supplied files are enabled.
- External URLs must allow only approved `http`/`https` schemes. Server-side retrieval must block private/link-local networks, redirects to blocked hosts, and oversized responses (SSRF protection).

### 2.4 Mutation integrity

- Create endpoints and retryable commands require `Idempotency-Key` with tenant/actor-scoped replay protection.
- Multi-record business operations must use a transaction and fail atomically.
- State transitions must validate allowed source and destination states.
- Concurrency-sensitive updates should use constraints, row locking, versions, or conditional updates to prevent lost changes.
- Destructive actions must use explicit targets and soft deletion where recovery/audit is expected.
- Simulation records must be marked and tracked separately; deleting simulation data must never match real user-created records.

### 2.5 Auditability and privacy

- Audit meaningful creates, updates, deletes, assignments, permission changes, state transitions, imports, exports, and administrative actions.
- Audit data should include tenant, actor/source, action, entity type/ID, request ID, timestamp, and safe before/after values where applicable.
- Never log passwords, session tokens, API secrets, authorization headers, raw personal documents, or full sensitive request bodies.
- Mask secrets in UI and API responses. Show newly generated secrets only once where possible.
- Store secrets only in approved server-side configuration or secret storage; never commit them or persist them in browser storage.

### 2.6 Web and API protections

- Use secure session cookies and CSRF protection for cookie-authenticated state changes.
- Apply rate limits to authentication, search, exports, uploads, external fetches, AI actions, and expensive reporting endpoints.
- Maintain restrictive CORS and security headers appropriate to deployment, including CSP, frame restrictions, content-type protection, and referrer policy.
- Error responses use the NPMS envelope and safe messages; internal stack traces and SQL details must not reach clients.
- Avoid dynamic SQL. When raw expressions are necessary, bind all values and review tenant filtering explicitly.

### 2.7 Dependencies and integrations

- Prefer maintained dependencies with clear ownership. Pin lockfiles and review new runtime packages for necessity, license, vulnerabilities, and bundle impact.
- Verify webhook signatures before processing and make webhook handling idempotent.
- Apply timeouts, bounded retries with backoff, circuit breaking where appropriate, and safe failure behavior to external integrations.

## 3. Performance requirements

### 3.1 API and database

- List endpoints must be bounded. Use pagination/cursors for potentially growing collections; default page size should be at most 50 and maximum at most 100 unless documented.
- Every UI list that can grow must use dynamic pagination. Pagination controls may hide when all records fit on one page, and standard page-size choices are 10, 25, and 50.
- Select only required columns. Avoid N+1 queries and per-row aggregate queries; use joins, grouped queries, eager loading, or precomputed summaries.
- Add indexes for tenant filters, foreign keys, common status/date filters, ordering, and uniqueness patterns introduced by a feature.
- Inspect query plans for new high-cardinality or multi-join queries.
- Target p95 server processing under 300 ms for ordinary reads and under 500 ms for ordinary writes at expected workspace scale, excluding intentional external calls.
- Long imports, exports, simulations, reports, and external synchronization should run asynchronously with progress/status rather than blocking a request.
- Cache stable expensive reads only with explicit tenant-aware keys and invalidation rules.

### 3.2 Frontend responsiveness

- Interactive feedback should appear within 100 ms; operations longer than 300 ms need visible pending feedback and duplicate-action prevention.
- Debounce search/filter network calls (normally 200–350 ms), cancel stale requests, and avoid request waterfalls.
- Use pagination, incremental rendering, or virtualization for large lists. Do not render unbounded simulation or history records at once.
- Keep state local to the smallest useful component and memoize only when measurement or clear identity stability justifies it.
- Drag-and-drop must provide a visible target, keyboard-accessible fallback where practical, rollback/error feedback, and persisted state when the action is not merely a draft.
- Editors must warn near 20,000 words and encourage external resources for substantially larger content. Avoid recomputing full-document statistics on every keystroke when content is large.

### 3.3 Assets and bundles

- Prefer code splitting for route/module-level features and lazy-load heavy editors, charts, PDF tools, and rarely used settings panels.
- New work must not materially increase the initial JavaScript bundle without justification. As a review threshold, investigate any feature adding more than 30 kB gzip to the initial bundle.
- Compress and appropriately size images; lazy-load non-critical media. Avoid embedding large base64 assets in application bundles.
- Preserve cacheable hashed production assets and avoid unnecessary cache-busting.
- Existing bundle-size or legacy CSS warnings are baseline debt, not permission to add new warnings.

### 3.4 Resource limits

Every externally controlled collection or payload needs an explicit bound, including tags, member IDs, tabs, checklist entries, API batch sizes, uploaded files, rich-text length, URL fetch size, and export ranges. Limits must exist server-side even when the UI also enforces them.

## 4. Required verification

Use checks proportional to risk. At minimum:

- Frontend: TypeScript check and production build; test changed interactions and light/dark contrast where relevant.
- Backend: syntax/static checks and endpoint tests for success, validation, authorization, tenant isolation, and idempotency where applicable.
- Database: migration up/down review, constraints/index review, and query-plan inspection for significant queries.
- Security-sensitive content: test unsafe HTML/Markdown/URL/file cases.
- Performance-sensitive work: test with realistic volume, not only empty or tiny fixtures; record before/after measurements for regressions or optimizations.

## 5. Security and Performance Feature Checklist

Before declaring a change complete, explicitly evaluate:

### Security

- [ ] Backend authentication and authorization are enforced.
- [ ] All tenant-owned queries and relationships are tenant-scoped.
- [ ] Input limits and safe output rendering are defined.
- [ ] Mutation is idempotent/transactional where required.
- [ ] Audit event coverage is appropriate and contains no secrets.
- [ ] Cross-tenant, forbidden-role, and invalid-input cases are tested.
- [ ] Upload, URL, rich content, export, and integration risks are handled when present.
- [ ] Simulation cleanup cannot delete real records.

### Performance

- [ ] Reads and payloads are bounded or paginated.
- [ ] No N+1 queries or avoidable per-row database calls were introduced.
- [ ] Necessary indexes and query plans were considered.
- [ ] Loading, error, retry, and stale-request behavior is clear.
- [ ] Large-list/editor behavior was tested with realistic fake data.
- [ ] Initial bundle and render cost were checked; heavy features are lazy-loaded where appropriate.
- [ ] Typecheck, relevant tests, and production build pass without new unexplained warnings.

## 6. AI implementation protocol

For every future feature, AI agents must:

1. Read this document and the relevant module specification before editing.
2. Identify the feature's trust boundaries, authorization rules, tenant-owned entities, expected data volume, and user-controlled inputs.
3. Include security and performance requirements in the implementation plan, endpoint/schema design, and tests.
4. Prefer measured, bounded solutions over unbounded convenience implementations.
5. Report verification performed, known baseline warnings, and any accepted exceptions in the final handoff.

The root `AGENTS.md` makes this document mandatory context for future repository sessions.