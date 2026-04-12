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

---

## 2026-04-12 — Codex runtime driver (`src/server/runtimes/codex-driver.ts`)

### Scope

Correctness + safety review of the Codex runtime driver (156 lines) and its test file. Read `types.ts` and `process-runner.ts` for context (invariants and the shared spawn helper) but did not review them in depth. Peer drivers `claude-driver.ts` and `qwen-driver.ts` were read only to understand module-wide conventions.

### Module shape

Implements the `RuntimeDriver` contract for the `codex` CLI. `execute()` and `summarize()` both shell out to `codex exec --json --cd <cwd> --dangerously-bypass-approvals-and-sandbox --output-last-message <tmpfile> [--model ...] [-c model_reasoning_effort="..."]`, pipe the prompt via stdin, parse streaming JSON events from stdout to drive the `onLog` callback, and read the final answer from the `--output-last-message` temp file when the process closes cleanly. Sandboxing is delegated to the caller (the driver trusts that `opts.cwd` has already been validated by the runner layer).

### Findings

| # | Severity | File | Status |
|---|---|---|---|
| 1 | MEDIUM | `codex-driver.ts:129–135` — non-ENOENT read errors silently coerced into `'codex produced no output'` | **Fixed** (e0b2c25) |
| 2 | MEDIUM | `codex-driver.test.ts` — `summarize()` had zero test coverage | **Fixed** (6fda108) |
| 3 | MEDIUM | `codex-driver.ts:148` — `execute()` has no caller-provided timeout; falls back to `runProcess`'s 30-minute default | Deferred |
| 4 | LOW | `codex-driver.ts:33` — `--dangerously-bypass-approvals-and-sandbox` is hardcoded with no comment explaining the sandbox assumption | Deferred |
| 5 | LOW | `codex-driver.ts:25` — `runtime_variant` passed as `--model` with no shape validation (safe from injection due to spawn args, but typos fail opaquely) | Deferred |

### Fixes in this pass

**e0b2c25 — surface real output-read errors.** `runCodex` wrapped `readFileSync(outputPath)` in a bare `catch { output = ''; }`, so permission-denied, disk-full, or any other `fs` error was silently replaced by a misleading `'codex produced no output'` message downstream. Changed the catch to capture the error and, if its `code` is anything other than `ENOENT`, re-throw with `Failed to read codex output file: ${err.message}`. The ENOENT branch is preserved so the existing "codex exited clean but didn't write the file" path still reports as "no output," which is what the test at `codex-driver.test.ts:201` asserts.

**6fda108 — test coverage for summarize().** Every existing test in `codex-driver.test.ts` exercised `execute()`; `summarize()` was entirely untested. Added a test that asserts summarize() spawns `codex exec` with the right `--cd`, forwards `runtime_variant` as `--model`, omits the `-c model_reasoning_effort` flag (because summarize passes `effort: null`), pipes the prompt via stdin, and returns the contents of the output file on a clean exit. Test count: 238 → 239.

### Deferred findings

**#3 — `execute()` has no caller-provided timeout.** `runCodex` accepts `timeoutMs?`, `summarize()` passes `60_000`, but `execute()` passes nothing, falling through to `DEFAULT_PROCESS_TIMEOUT_MS = 30 * 60 * 1000` in `process-runner.ts:9`. A stuck codex run can block a worker for half an hour. **Not fixed here because this is a module-wide pattern, not codex-specific**: `claude-driver.execute()` and `qwen-driver.execute()` both behave identically. A proper fix would add `timeoutMs?: number` to `ExecuteStepOptions` in `types.ts`, thread it through all three drivers, and have the runner set a reasonable per-step default. Outside the scope of a codex-only review; flag for the next runtimes pass.

**#4 — undocumented `--dangerously-bypass-approvals-and-sandbox`.** The flag is present at `codex-driver.ts:33` with no comment. The driver relies on the caller having validated `cwd` against an authorized path, but nothing in the code points a future reader at that contract. Low-risk cleanup, not worth a standalone commit.

**#5 — `runtime_variant` shape.** Passed as a separate spawn arg, so immune to shell injection, but a typo lets codex fail obscurely. A regex guard (`^[a-zA-Z0-9._-]+$`) would catch typos early. Not worth touching without a recurring incident.

### Side notes (not fixed)

- `formatCodexEventBody` silently drops JSON events with no `msg`/`message`/`text`/recognized `type` — intentional per the comment at `codex-driver.ts:114`, and already covered by the test at `:242`. If codex ever adds a new event shape, the driver will go quiet but keep working.
- `allocateOutputPath` uses `jobId + Date.now()` for the temp filename; not collision-free in theory but fine in practice since `jobId` is unique per run.
- On `runProcess` throw, `runCodex` still runs the `unlinkSync` cleanup for the temp file in a `try/catch`, which is good. The `writeFileSync → spawn fails → read-throws-ENOENT → we throw the caught error` path is correct.

### Verification

- `npx tsc --noEmit` — clean
- `npx vitest run src/server/runtimes/codex-driver.test.ts` — 10/10 pass (up from 9)
- `npx vitest run` — 239/239 pass in 39 files (previously 238)

---

## 2026-04-12 — Optimistic update helpers (`src/web/lib/optimistic-updates.ts`)

### Scope

Correctness review of the 73-line helper module that powers drag-and-drop optimistic list updates on the frontend. Traced the only caller (`src/web/hooks/useProjectOrderingMutations.ts`) to confirm how the helpers are used by workstream / task / flow reordering handlers. The caller itself was not reviewed in depth.

### Module shape

Four pure helpers, all immutable, all generic over `{ id; position }`:

- `applyPositionUpdates(items, updates, { sort? })` — maps the list, swapping positions for ids present in `updates`; optionally sorts by position. Preserves references for untouched items.
- `buildRelativeMovePositionUpdates(items, draggedId, targetId, side)` — computes a minimum-set `{ [id]: position }` update for a drag-drop. Uses midpoint insertion (`prev + (next - prev) / 2`) when there's room, falls back to a full renumber (`1, 2, 3, …`) if the gap drops below `Number.EPSILON`.
- `applyTaskMove(tasks, taskId, workstreamId, newPosition)` — returns a new list with the task's workstream and position updated; no-op if the id is missing.
- `replaceItemById(items, replacement)` — returns a new list with the replacement substituted in; no-op if the id is missing.

All four are used by `useProjectOrderingMutations.ts` for reorder + rollback flows.

### Findings

| # | Severity | File | Status |
|---|---|---|---|
| 1 | MEDIUM | `optimistic-updates.test.ts` — six branches of `buildRelativeMovePositionUpdates` had zero coverage (dragged-missing, target-missing, same-separator no-op, drop-at-start, drop-at-end, reorder fallback) | **Fixed** (9338aff) |
| 2 | LOW | `optimistic-updates.ts:71` — `replaceItemById` stores the exact `replacement` reference | Won't fix |

### Fixes in this pass

**9338aff — branch coverage.** The original 3 tests all walked the middle-of-the-list happy path (`ws-1 → left of ws-3` and similar), so every guard in `buildRelativeMovePositionUpdates` (missing ids, same-separator no-op, drop-at-start, drop-at-end, the full-reorder fallback when the adjacent gap drops below `Number.EPSILON`) was unreached. Added 10 tests that cover each of those branches, plus the `sort: false` branch of `applyPositionUpdates`, the reference-preservation invariant for items without updates, and the no-op behavior of `applyTaskMove` / `replaceItemById` when the target id is missing. Test count 239 → 249. No production code changed.

### Not-fixing findings

**`replaceItemById` stores the exact replacement reference** (line 71-73, `items.map(item => (item.id === replacement.id ? replacement : item))`). In theory a caller could mutate the replacement after the call and leak the mutation into the returned array. In practice every current caller passes a frozen previous-state snapshot during rollback, and adding a shallow copy would mask — not prevent — future caller bugs. The function name already implies "use this object," so the behavior matches the contract.

### Side notes (not fixed)

- `handleSwapWorkstreams` and `handleSwapFlows` in `useProjectOrderingMutations.ts` scope/filter items before calling `buildRelativeMovePositionUpdates`, but then call `applyPositionUpdates(prev, updates, { sort: true })` on the full list. That's correct only if scoped and non-scoped items share a global position namespace — which they appear to do, but it's worth confirming in whichever review covers the workstream-scoping logic.
- `buildRelativeMovePositionUpdates` uses `Number.EPSILON` as the precision threshold. After ~52 cascading midpoint insertions the gap halves to EPSILON and the reorder fallback kicks in. The 10-tests-added here cover this path directly with a hand-constructed `1 + EPSILON/2` input.
- The helpers have no input validation (sorted-ness, positive positions, id shape). Intentional — they're generic over any `{ id; position }` shape and trust the caller.

### Verification

- `npx tsc --noEmit` — clean
- `npx vitest run src/web/lib/optimistic-updates.test.ts` — 13/13 pass (up from 3)
- `npx vitest run` — 249/249 pass in 39 files (previously 239)

---

## 2026-04-12 — Git checkpoint module (`src/server/checkpoint.ts`)

### Scope

Correctness + safety review of the git checkpoint module (98 lines) used to snapshot a worktree before a job runs and restore it on job reject/revert. Read `git-utils.ts` for context (thin `execFileSync` wrapper, no shell invocation). Traced callers — `worker.ts`, `flow/orchestrator.ts`, `routes/job-reject.ts`, `routes/job-revert.ts`, `routes/job-approve.ts`, `routes/job-rework-start.ts` — just enough to confirm that all callers gate `localPath` through `requireAuthorizedLocalPath` before invoking the module.

### Module shape

Three exports:

- `createCheckpoint(localPath, jobId)` — reads HEAD SHA, captures current branch name (or null for detached), stages everything (`git add -A`), makes an `--allow-empty` "checkpoint" commit, saves the commit SHA under `refs/workstream/checkpoints/${jobId}`, stores the branch name in git config (`workstream.checkpoint.${jobId}.branch`), then does a `git reset --mixed HEAD~1` to undo the commit while keeping files exactly where they were.
- `revertToCheckpoint(localPath, jobId)` — verifies the ref exists, runs `git checkout <ref> -- .` to restore tracked files, `git clean -fd --exclude=.codesync` to remove untracked residue, `git reset` to unstage, then optionally re-checks-out the saved branch if HEAD drifted, and finally calls `deleteCheckpoint`.
- `deleteCheckpoint(localPath, jobId)` — `update-ref -d` and `config --unset`, both in try/catch so a stale ref doesn't prevent cleanup of the config key.

### Findings

| # | Severity | File | Status |
|---|---|---|---|
| 1 | MEDIUM | `checkpoint.ts:57-61` — `git clean -fd` failure silently swallowed; revert reports success with untracked residue remaining | **Fixed** (fe72a39) |
| 2 | LOW | `checkpoint.ts:29,43,88` — `jobId` interpolated into ref names / config keys with no format guard | **Fixed** (fe72a39) |
| 3 | — | entire file had **zero tests** despite running `reset`, `clean -fd`, `checkout` | **Fixed** (2965314) |
| 4 | LOW | `checkpoint.ts:67-78` — silent catch on branch-restore leaves HEAD wherever the previous `checkout ref -- .` left it if the saved branch was deleted | Deferred |
| 5 | LOW | deleteCheckpoint failures are only logged, not surfaced; orphaned refs accumulate under `refs/workstream/checkpoints/` | Deferred |

### Fixes in this pass

**fe72a39 — surface git clean failures + validate jobIds.**

*`git clean` swallow.* The revert path wrapped `git clean -fd --exclude=.codesync` in `try { ... } catch { /* not fatal */ }`. When clean actually failed (permission denied on a path, read-only sub-mount), the tracked files had already been restored but untracked residue from the rejected job silently stayed on disk — and there was no log line to tell operators what happened. Changed to a warn-level log with a clear message ("tracked files were restored; untracked residue may remain") and kept the revert non-fatal so callers' existing behavior is preserved.

*JobId validation.* `jobId` is interpolated into `refs/workstream/checkpoints/${jobId}` and `workstream.checkpoint.${jobId}.branch`. All current call sites pass database-issued UUIDs, so there's no known exploit — but `execFileSync('git', […], …)` is only shell-safe, not flag-safe, and a future route that sources jobId from untrusted input could hand git something like `--help` or `foo;bar`. Added a `JOB_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/` guard invoked at the top of `createCheckpoint`, `revertToCheckpoint`, and `deleteCheckpoint`, rejecting empty strings, leading-dash values, and anything containing shell metacharacters. UUIDs pass through unchanged.

**2965314 — test coverage for a previously-untested destructive module.** Added `src/server/checkpoint.test.ts` with `vi.mock('./git-utils.js')` so every git call is redirected through a mock. Eight tests cover: the validation rejections don't reach any git call; the happy-path sequence of git subcommands emitted by `createCheckpoint`; the branch-config write is skipped on detached HEAD; `revertToCheckpoint` throws `'No checkpoint found'` for a missing ref; `revertToCheckpoint` still returns `{ reverted: true }` but emits the new warn log when `git clean` fails; `deleteCheckpoint` unsets both ref and config key and only warns (doesn't throw) on a ref-delete failure. Test file count 39 → 40, test count 249 → 257.

### Not-fixing findings

**#4 — branch restore is best-effort.** Lines 67-78 look up the saved branch, compare against current HEAD, and `git checkout <branch>` if they differ. All of that is wrapped in `try { } catch { }`. If the saved branch was force-pushed, deleted, or had conflicting uncommitted changes created by the restored checkpoint state, the checkout fails and we silently stay on whatever branch HEAD was pointing at when revert started. That's acceptable — the checkpoint's tracked state has already been restored on disk — but it's subtle enough that a comment explaining why the catch is okay would help. Left as-is; too small for a standalone commit.

**#5 — no cleanup path for orphaned refs.** `deleteCheckpoint` runs on the happy path (job approved / job reworked), but if both `update-ref -d` calls fail (ref corrupted, git lockfile stuck), the ref lingers forever under `refs/workstream/checkpoints/`. A periodic background sweep for stale refs older than N days would solve it. Out of scope; flag for whichever review covers background maintenance.

### Side notes (not fixed)

- `git-utils.ts:7-10` — `git()` (the async version) defaults to `timeout = 15000`, but none of the autocommit / checkpoint call sites override it. A 15s git operation is plenty for a clean local repo, but a large checkpoint / worktree with millions of files could hit it. Not worth acting on until it's observed.
- `createCheckpoint` uses `git config workstream.checkpoint.${jobId}.branch` as its out-of-band storage for the branch name. A slight smell — git notes or a json file under `.git/workstream-checkpoints/` would be more self-contained — but works fine and costs nothing.
- `git clean -fd --exclude=.codesync` hardcodes the `.codesync` exclusion. If the project ever gets a second path that must survive revert, it needs to be added here. Worth extracting to a named constant when there's a second one.

### Verification

- `npx tsc --noEmit` — clean
- `npx vitest run src/server/checkpoint.test.ts` — 8/8 pass (new file)
- `npx vitest run` — 257/257 pass in 40 files (previously 249 in 39 files)

---

## 2026-04-12 — Process lifecycle (`src/server/process-lifecycle.ts`)

### Scope

Correctness review of the 73-line process-lifecycle module that tracks live child processes by `jobId` and coordinates cancellation. Read `process-runner.ts`, `worker.ts:532-540`, and `runner.ts` for context — just enough to understand how callers register procs, check cancellation flags, and hook the shutdown signal. Did not review those files in depth.

### Module shape

Two maps of module-level state:

- `activeProcesses: Map<jobId, Set<ChildProcess>>` — every child process registered by a runtime driver (via `process-runner.ts:46`). One jobId can hold multiple procs (rare but supported).
- `canceledJobs: Set<jobId>` — a flag so that in-flight `close` handlers in `process-runner.ts:100` can distinguish "exited cleanly" from "killed because the job was canceled."

Exports: `registerActiveProcess` / `unregisterActiveProcess` / `getActiveProcessCount` / `isJobCanceled` / `markJobCanceled` / `clearJobCancellation` / `terminateProcess` (private) / `cancelJob` / `cancelAllJobs`. `terminateProcess` sends SIGTERM, escalates to SIGKILL after 5s, and self-finishes after a 6s fallback timer regardless.

### Findings

| # | Severity | File | Status |
|---|---|---|---|
| 1 | HIGH | `process-lifecycle.ts:68-73` (old) / `worker.ts:538` — `cancelAllJobs()` was fire-and-forget; shutdown exited before child processes died | **Fixed** (34da943) |
| 2 | MEDIUM | `process-lifecycle.ts:68-73` (old) — `cancelAllJobs()` didn't call `markJobCanceled` for the jobs it was killing, so in-flight runner close handlers saw them as normal exits | **Fixed** (34da943) |
| 3 | LOW | `process-lifecycle.test.ts` — no test pinned that the cancellation flag stays set *while* termination is in-flight | **Fixed** (34da943, added test) |

### Fixes in this pass

**34da943 — async cancelAllJobs + cancellation marking.** Two coupled issues, one commit.

*Fire-and-forget shutdown.* The old `cancelAllJobs` body was:

```ts
for (const [jobId, processes] of activeProcesses) {
  activeProcesses.delete(jobId);
  for (const proc of processes) terminateProcess(proc).catch(() => {});
}
```

It returned synchronously while `terminateProcess` promises were still in-flight. `worker.ts:538` then called `cancelAllJobs()` (no await), `await flushLogs()`, and `process.exit(0)`. Any child proc that hadn't died within a few microtasks got orphaned by the exit. Rewrote it to collect the termination promises into an array and `await Promise.all(...)` before returning. `worker.ts:538` now `await cancelAllJobs()`.

*Missing cancellation mark.* Between the snapshot and the terminate loop, the new implementation calls `markJobCanceled(jobId)` for each affected job. That way, the close handler in `process-runner.ts:100` sees `isJobCanceled(jobId) === true` and rejects with `'Job canceled'` instead of letting the SIGTERM'd process look like a clean exit. After `Promise.all` resolves, the flags are cleared so a re-queued job of the same id isn't poisoned.

*Test hook.* `process-lifecycle.test.ts`'s `beforeEach(cancelAllJobs)` was synchronous; after the async change, state from one test (canceled flags set mid-termination) was leaking into the next. Made `beforeEach` await. Reworked the existing `cancelAllJobs kills processes across all jobs` test to await the promise directly (was sleeping 10ms as a workaround). Added a new test that uses a stubborn MockProc to observe the cancellation flag while a proc is still closing — pins the invariant that the flag stays `true` until `await Promise.all(...)` resolves, then flips to `false`.

Test count 257 → 258.

### Verified false positives

- **"Race between spawn and register"** — the subagent flagged a window between `spawn(...)` at `process-runner.ts:40` and `registerActiveProcess(...)` at `:46`. Those two lines are fully synchronous in one microtask; nothing in Node can interleave between them, so no cancel can arrive in that window.
- **"`canceledJobs` leaks forever"** — the subagent claimed this set grew unbounded. In practice the only production caller of `markJobCanceled` is `cancelJob` itself (and now `cancelAllJobs`), both of which clean up via `clearJobCancellation` after terminating. Test code calls `markJobCanceled` directly but resets between tests. No production leak.
- **"`cancelJob` clears cancellation too early"** — the subagent worried that `clearJobCancellation` at the end of `cancelJob` could race with live procs. But `clearJobCancellation` runs *after* `await Promise.all([...processes].map(terminateProcess))`, and the `terminateProcess` resolve happens after the proc's `close` event — which is also the same tick that `process-runner.ts`'s close handler reads `isJobCanceled`. The read is guaranteed to happen before the clear.

### Side notes (not fixed)

- `terminateProcess` has a 6s fallback `setTimeout` that resolves the promise even if the proc never emits `close`. This is a graceful-shutdown guarantee (you can't wait forever on a stuck child), but it means a truly unkillable proc leaves the promise resolved and the parent moves on. Keep as-is.
- `cancelJob` calls `activeProcesses.delete(jobId)` after awaiting the terminations — this is redundant because `process-runner.ts`'s close handler calls `unregisterActiveProcess` which removes the entry when empty. Redundant but harmless.
- `getActiveProcessCount` is only referenced from tests. Could be removed, but it's a one-line utility and deleting it would be churn for no production benefit.

### Verification

- `npx tsc --noEmit` — clean
- `npx vitest run src/server/process-lifecycle.test.ts` — 8/8 pass (up from 7)
- `npx vitest run` — 258/258 pass in 40 files (previously 257)

---

## 2026-04-12 — File-passing gates (`src/web/lib/file-passing.ts`)

### Scope

Correctness + safety review of the 122-line helper module that computes "can this task accept files yet? / does it need to attach a file before completing?" gates for the workstream task flow. Module is called by `useTaskFileGate.ts`, `WorkstreamTaskChainGroup.tsx`, and `WorkstreamTaskListContent.tsx`. Read those callers just enough to confirm the contract; not reviewed in depth.

### Module shape

Six exports, all pure functions over task/artifact snapshots:

- `taskAcceptsFiles(task)` / `taskProducesFiles(task)` — predicates on `task.chaining` (`'none'|'accept'|'produce'|'both'`).
- `isTaskApprovedForFilePassing(task, jobStatus?)` — returns true if `task.status === 'done'` OR `jobStatus === 'done'`. Two-source design: one branch for manual approval (task record flipped to `done`), the other for auto-approval (the job finishes and drags the task to `done` out of band).
- `buildTaskFileDependency(previousTask, previousJobStatus?)` — packages upstream state for the gate helper; normalizes missing inputs to `null`.
- `getTaskFileGate({task, dependency, ownArtifacts, previousArtifacts})` — computes the blocking gate: an ordered cascade of input-side checks (for `needsInput`) followed by output-side checks (for `needsOutput`). Returns `{ blocked, checking, reason, message }`.
- `hasFileAwaitingApproval({task, jobStatus, ownArtifacts})` — true iff a producing task currently has a file uploaded and its job is in `review` state.

### Findings

| # | Severity | File | Status |
|---|---|---|---|
| 1 | MEDIUM | `file-passing.test.ts` — zero tests for any of the three `needsOutput` branches of `getTaskFileGate` (output-file-missing, output-file-loading, output-file-check-failed) | **Fixed** (89c1de0) |
| 2 | MEDIUM | `file-passing.test.ts` — `hasFileAwaitingApproval` only had its one positive case covered; every negative case was unreached | **Fixed** (89c1de0) |
| 3 | LOW | four small exported helpers (`taskAcceptsFiles`, `taskProducesFiles`, `isTaskApprovedForFilePassing`, `buildTaskFileDependency`) had no direct tests | **Fixed** (89c1de0) |

### Fixes in this pass

**89c1de0 — comprehensive test coverage.** Added 16 tests, no production code changed. The existing 4 tests walked three narrow paths (two accept-side input gates + the one positive `hasFileAwaitingApproval` case). The new tests exercise every `needsOutput` branch of `getTaskFileGate` (including a happy-path pass-through when an output file is loaded), the `missing-previous-task` / `previous-file-check-failed` / `none`-chaining branches that were unreached, every negative case of `hasFileAwaitingApproval`, both chaining values for each predicate helper, both approval paths (manual `task.status='done'` and auto `jobStatus='done'`) for `isTaskApprovedForFilePassing`, and `buildTaskFileDependency`'s normalization of missing inputs. Test count **258 → 274**.

### Verified false positives

- **Subagent called `isTaskApprovedForFilePassing` a "critical semantic bug"** — claimed the `||` between `task?.status === 'done'` and `jobStatus === 'done'` would silently approve tasks with undefined status when a done jobStatus was present. The agent even contradicted itself mid-analysis ("task.status should always exist if previousTask exists"). Reading the callers confirms this is intentional dual-source approval: a task record can be flipped to `done` manually (task status) OR auto-promoted when its job completes (job status). The OR is correct, and the new `isTaskApprovedForFilePassing` tests pin both paths explicitly so future refactors don't lose them.

### Side notes (not fixed)

- `getTaskFileGate` encodes the precedence "upstream-input gates strictly before downstream-output gates." The existing "prioritizes upstream approval over the accepting task output requirement" test pinned the `'both'` case where the input blocks early; the new `both-chained tasks passing the input gate and then blocking on the output gate` test pins the complementary case. If the cascade order is ever reshuffled, both tests will fail — good.
- `hasFileAwaitingApproval` hardcodes the single `jobStatus === 'review'` trigger. If a future workflow adds a second "awaiting-review"-style status, this will silently not match. Out of scope.

### Verification

- `npx tsc --noEmit` — clean
- `npx vitest run src/web/lib/file-passing.test.ts` — 20/20 pass (up from 4)
- `npx vitest run` — 274/274 pass in 40 files (previously 258)
