# Continuous Review Log

Rolling log of systems reviewed on the `contiunous-review` branch. Each pass picks one system, audits it, fixes the top issues, and records findings here so the next pass can skip what's already been covered.

---

## 2026-04-12 — Authorization module (`src/server/authz-*`)

### Scope

Security-focused review of the server-side authorization layer: `authz.ts`, `authz-shared.ts`, `authz-membership.ts`, `authz-records.ts`, `authz-paths.ts`, `authz-path-member.ts`, `authz-path-utils.ts`, `authz-registered-paths.ts`, and the parts of `auth-middleware.ts` that consume them. Traced call sites into routes to verify the contract but did not review routes in depth.

### Module shape

Two guards: (1) **project membership** — the caller must be a member of the project a record belongs to, with role `member` or `admin`; (2) **registered local paths** — filesystem operations must target a path inside a project member's registered local_path. Identity comes from the JWT in `auth-middleware.ts`. Membership is fetched fresh per request (no caching, so revocation is immediate). Default is fail-closed throughout — denials return null and callers uniformly check `if (!access) return;`.

### Findings

| # | Severity | File | Status |
|---|---|---|---|
| 1 | HIGH | `routes/artifact-delete.ts` — any project member could delete any artifact | **Fixed** (167be40) |
| 2 | MEDIUM | `authz-records.ts`, `authz-registered-paths.ts` — raw Supabase error messages leaked on 500s | **Fixed** (fe6c0ad) |
| 3 | MEDIUM | `authz-path-utils.ts` / `authz-registered-paths.ts` — TOCTOU between path validation and use | Deferred |
| 4 | LOW | `authz-membership.ts:26` — DB error and "not a member" are indistinguishable to callers | Deferred |

### Fixes in this pass

**fe6c0ad — authz error-leak.** `requireRecordAccess` in `authz-records.ts:25` and `getRequestMemberships` in `authz-registered-paths.ts:13` were returning `error.message` directly in 500 responses, exposing table names and SQL details to any authenticated caller. Swapped for a generic `'Failed to load …'` response with the underlying error logged server-side, matching the pattern already used by `getProjectMember` in `authz-membership.ts`. Also tightened the `Record is missing project_id` branch in `authz-records.ts:36` so it no longer tells the client which column is missing.

**167be40 — artifact ownership.** `DELETE /api/artifacts/:id` only called `requireTaskAccess`, which verifies project membership on the parent task. Any member could wipe any other member's uploads. The `task_artifacts` schema had no uploader column at all, so the fix is threefold: (a) migration `00041_task_artifacts_uploaded_by.sql` adds a nullable `uploaded_by uuid references public.profiles(id) on delete set null`; (b) `artifact-create.ts` now writes `uploaded_by: getUserId(req)` on insert; (c) `artifact-delete.ts` requires the caller to be either the uploader or a project admin. Rows that predate the migration (NULL `uploaded_by`) and orchestrator-created artifacts (the flow orchestrator still leaves it NULL, as intended) are admin-only to delete.

### Deferred findings

**#3 — TOCTOU on registered local paths.** `authz-path-utils.ts::existingRealPath` resolves symlinks at check time via `realpathSync`, but routes like `git-workstream.ts` execute the filesystem operation later. An attacker with write access to the project directory can swap a symlink between check and use and escape the authorized path. Proper fix is to re-resolve immediately before use and ideally use `AT_SYMLINK_NOFOLLOW`-equivalent operations; requires a wider refactor of the path-accepting routes and is out of scope for this pass.

**#4 — Indistinguishable denial / DB error in `authz-membership.ts`.** When the `project_members` fetch fails with a non-`PGRST116` error, `getProjectMember` logs server-side but still returns `null`, which the caller treats identically to "not a member." This isn't a security hole (fail-closed is the right default) but makes operational debugging harder. Fix would be to propagate a distinct error state through `ProjectAccess`; not worth a focused change until something actually needs it.

### Side notes (not fixed)

- `flow/orchestrator.ts:95` upserts into `task_artifacts` with `onConflict: 'task_id,filename'`, but no unique constraint on `(task_id, filename)` exists in the migrations. The upsert silently falls back to insert and can create duplicate rows. Belongs to the flow/orchestrator system; flag when that system is the review target.
- Several route files (`artifact-create.ts:49`, `artifact-delete.ts:21-23`, `job-reject.ts:36/40/48/53`) still return raw Supabase `error.message` in 400/500 responses. The same information-disclosure concern as finding #2 applies; belongs to a route-layer hardening pass, not this authz review.

### Verification

- `npx tsc --noEmit` — clean
- `npx vitest run` — 238 tests in 39 files pass (unchanged from baseline)
- No tests directly cover the authz module or the artifact routes; changes were verified by typecheck and full regression only.
