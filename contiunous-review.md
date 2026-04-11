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

---

## 2026-04-12 — Auto-continue module (`src/server/auto-continue*`)

### Scope

Correctness review of the auto-continue module (`auto-continue.ts`, `auto-continue-next.ts`, `auto-continue-queue.ts`, `auto-continue-human.ts`, `auto-continue-types.ts` — ~162 lines). Traced call sites: `worker.ts:298`, `routes/task-auto-continue.ts:34`, `routes/job-approve-effects.ts:66`. Callers were not reviewed in depth.

### Module shape

Stateless coordinator. Entry point `queueNextWorkstreamTask({projectId, localPath, workstreamId, completedPosition})` is called when a task finishes. It finds the next `backlog`/`todo` task in the workstream whose `position > completedPosition`. If the next task is a human task, it's marked `in_progress` and (optionally) the assignee is notified. Otherwise the function checks that no other job is active on the workstream, resolves the flow, inserts a queued job, and flips the task to `in_progress`.

### Findings

| # | Severity | File | Status |
|---|---|---|---|
| 1 | HIGH | `auto-continue-next.ts:28` — `checkWorkstreamHasOnlyFinishedTasks` never inspected query result (silent no-op) | **Fixed** (10d5544) |
| 2 | HIGH | `auto-continue-queue.ts:35`, `auto-continue-human.ts:5` — task status UPDATE had no WHERE guard on prior status | **Fixed** (b58cadf) |
| 3 | LOW | `auto-continue-types.ts:13` — unused `completedTaskId` parameter silently passed by all 3 callers | **Fixed** (1469232) |
| 4 | HIGH | `auto-continue.ts:15` + `:28` — TOCTOU race: two concurrent completions can both select the same next task and insert duplicate jobs | Deferred |

### Fixes in this pass

**10d5544 — broken workstream-complete check.** `checkWorkstreamHasOnlyFinishedTasks` destructured only `{ error }` from the `select('id')` query, so the SELECT ran but the result was never examined. The function was effectively a no-op whose name implied a check. Fix: destructure `{ data, error }`, emit a completion log when `data` is empty, and a warning when unfinished tasks exist but no next auto-continuable task was matched.

**b58cadf — unguarded status UPDATE.** Both `queueAiTask` and `markHumanTaskInProgress` did `update({ status: 'in_progress' }).eq('id', task.id)` with no guard on the prior status. A concurrent user cancel or completion would be silently overwritten. Fix: scope the UPDATE to `.in('status', ['backlog','todo'])`, read back the affected row via `.select('id').maybeSingle()`, and treat "zero rows" as "no longer eligible" — rolling back the queued job in `queueAiTask` and skipping the notification in `markHumanTaskInProgress`.

**1469232 — dead `completedTaskId` parameter.** `QueueNextWorkstreamTaskParams.completedTaskId` was never destructured in `queueNextWorkstreamTask` — the next task is located purely by `workstreamId + completedPosition`. All three call sites were passing it for nothing. Removed from the interface and from `worker.ts`, `routes/task-auto-continue.ts`, and `routes/job-approve-effects.ts`.

### Deferred findings

**#4 — TOCTOU on next-task selection.** `queueNextWorkstreamTask` calls `findNextWorkstreamTask` then `hasActiveWorkstreamJob` then `queueAiTask`. Nothing in this path is atomic. Two concurrent completions on the same workstream can both see no active job, both identify the same next task, and both insert a queued job, resulting in duplicate jobs for the same task. The cleanest fix is a DB-level partial unique index on `jobs(task_id) WHERE status IN ('queued','running','paused','review')` — that's a migration change plus a caller-side handling branch for the "someone else already queued this" insert error. Out of scope for this pass; note that the b58cadf fix partially mitigates the task-side race (the second UPDATE will find the task already `in_progress` and roll back its job), but leaves a narrow window where two jobs could both insert before either updates the task.

### Side notes (not fixed)

- `auto-continue-queue.ts`: If `job` insert succeeds but task `update` subsequently fails AND the `delete` cleanup also fails, the job is orphaned in `queued` status with no task advancing. Not worth chasing until it's observed in practice — the cleanup error is logged.
- `auto-continue.ts:21` treats `nextTask.mode === 'human'` as the branch condition, but `mode` is typed `string | null` in `auto-continue-types.ts`, so any unknown future mode value would fall through to AI queueing. Consider an explicit allow-list when the mode set grows.

### Verification

- `npx tsc --noEmit` — clean
- `npx vitest run` — 238 tests in 39 files pass (unchanged)
- `process-lifecycle.test.ts`, `flow-resolution.test.ts`, and `dispatcher.integration.test.ts` exercise adjacent paths but none directly cover auto-continue; changes verified by typecheck + full regression.
