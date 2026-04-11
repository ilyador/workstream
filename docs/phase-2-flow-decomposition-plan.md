# Phase 2: Flow Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Extract `buildStepPrompt`, `runFlowJob`, and the gate evaluation helpers from `src/server/runner.ts` (currently 803 lines) into a focused `src/server/flow/` directory, dropping `runner.ts` to ~150 lines of Phase 3 residue.

**Architecture:** Three new files under `src/server/flow/`. `gate-evaluation.ts` is a pure-function module (verdict parsing, legacy heuristics). `prompt-builder.ts` owns `buildStepPrompt` after refactoring its 12-case switch into named helper functions. `orchestrator.ts` owns `runFlowJob`, its internal DB helpers, `scanAndUploadArtifacts`, and three extracted internal helpers (`checkGate`, `detectPauseQuestion`). `runner.ts` retains only `cleanupOrphanedJobs` plus re-exports so external callers do not need to change imports.

**Tech Stack:** TypeScript ESM (.js extension on local imports), vitest (pnpm test), Supabase mocked in tests.

**Prerequisite:** Per CLAUDE.md, feature branches must live in git worktrees. Before starting: `git worktree add .worktrees/flow-decomposition -b workstream/flow-decomposition main`. All tasks assume that working directory.

**Baseline:** main is at 982a94d (Phase 1 + env cleanup). 181/181 tests passing. runner.ts is 803 lines.

---

## File Structure

**New files:**

- `src/server/flow/gate-evaluation.ts` — `PhaseVerdict` type, `extractPhaseSummary`, `extractVerdict`, `legacyVerifyCheck`, `legacyReviewCheck`. Pure functions, no I/O.
- `src/server/flow/gate-evaluation.test.ts` — unit tests for verdict parsing, summary extraction, legacy heuristics.
- `src/server/flow/prompt-builder.ts` — `buildStepPrompt` plus 12 named context-source helpers, `formatRagResults`, `readFileOrEmpty` utility.
- `src/server/flow/prompt-builder.test.ts` — focused tests for representative helpers.
- `src/server/flow/orchestrator.ts` — `FlowJobContext` interface, `runFlowJob`, `summaryRuntimeStep`, internal DB helpers, `scanAndUploadArtifacts`, and private helpers `checkGate`, `detectPauseQuestion`.
- `src/server/flow/orchestrator.test.ts` — focused tests for `checkGate`, `detectPauseQuestion`.

**Modified files:**

- `src/server/runner.ts` — becomes a thin shell (~130 lines): `cleanupOrphanedJobs` plus re-exports of `runFlowJob`, `FlowJobContext`, `buildStepPrompt`, `scanAndUploadArtifacts`, `cancelJob`, `cancelAllJobs`, and the type re-exports. All existing callers continue to import from `./runner.js` unchanged.

---

## Task 1: Extract gate-evaluation module

Pure-function extraction. The 4 gate helpers plus `PhaseVerdict` have no filesystem or DB dependencies.

**Files:**
- Create: `src/server/flow/gate-evaluation.ts`
- Create: `src/server/flow/gate-evaluation.test.ts`
- Modify: `src/server/runner.ts` — add import, delete the 4 function definitions and `PhaseVerdict` interface

- [ ] **Step 1.1: Write the failing test**

Create `src/server/flow/gate-evaluation.test.ts` with tests covering:

1. `extractPhaseSummary` — [summary] tag extraction, 200-char truncation, fallback to last meaningful line, stripping of bullet markers, skipping RULES/IMPORTANT lines.
2. `extractVerdict` — fenced JSON block parsing, preference for the LAST verdict when multiple present, unfenced JSON on a line of its own, null on malformed JSON, null on missing verdict, default reason to empty string.
3. `legacyVerifyCheck` — "failing tests" in tail → true, "no failures" → false, "0 failed" → false, "error" without exclusion → true, ignoring "failing tests" earlier in the echoed prompt (only last 20 lines).
4. `legacyReviewCheck` — "issues found" → true, "no issues found" → false, "0 issues" → false, "fail"/"reject" → true.

Aim for 18 tests total. Each test uses a realistic output string literal and asserts the expected return value. No mocks needed (all functions are pure).

- [ ] **Step 1.2: Run test to verify it fails**

Run: `pnpm test src/server/flow/gate-evaluation.test.ts`
Expected: FAIL — `Cannot find module './gate-evaluation.js'`.

- [ ] **Step 1.3: Create the new module**

Move the 4 functions and the `PhaseVerdict` interface from `src/server/runner.ts:617-694` into `src/server/flow/gate-evaluation.ts` verbatim, changing each `function` declaration to `export function` and exporting the `PhaseVerdict` interface.

Preserve these implementation details exactly:
- `extractPhaseSummary`: tries `[summary]` regex first, truncates at 200 chars with `...` suffix, falls back to filtering lines (skip empty, skip `^[`, skip `---`/```/`#`, skip `*==`, skip RULES/IMPORTANT), strips leading `- ` or `* ` and surrounding backticks from the fallback line.
- `extractVerdict`: first tries all fenced code blocks (last one wins), then checks the last 5 lines for a standalone JSON object. Returns null if neither path yields a valid `{ passed: boolean }` object.
- `legacyVerifyCheck`: checks only the last 20 lines (lowercase), looks for `\bfail\b` or `tests? fail` regex, or `error`/`not passing`, excludes `no failures`/`0 failed`/`fixed`.
- `legacyReviewCheck`: checks full output (lowercase), looks for `issues? found` regex or `fail`/`problem`/`reject`, excludes `no issues found`/`no issues`/`0 issues`.

- [ ] **Step 1.4: Run test to verify it passes**

Run: `pnpm test src/server/flow/gate-evaluation.test.ts`
Expected: PASS, 18 tests.

- [ ] **Step 1.5: Update runner.ts to import from the new module**

Edit `src/server/runner.ts`:

1. Add import at the top after the runtimes import:

```
import {
  extractPhaseSummary,
  extractVerdict,
  legacyVerifyCheck,
  legacyReviewCheck,
} from './flow/gate-evaluation.js';
```

2. Delete the `PhaseVerdict` interface (runner.ts:619-622).
3. Delete the 4 function definitions: `extractPhaseSummary` (624-646), `extractVerdict` (648-675), `legacyVerifyCheck` (677-686), `legacyReviewCheck` (688-693).

The call sites inside `runFlowJob` at runner.ts:416, 443, 446 already reference these functions by name; the new import makes them available.

- [ ] **Step 1.6: Run the full test suite**

Run: `pnpm test`
Expected: 199 tests passing (181 existing + 18 new).

- [ ] **Step 1.7: Typecheck**

Run: `pnpm tsc --noEmit` (use `pnpm exec tsc -p tsconfig.app.json --noEmit --pretty false`)
Expected: no errors.

- [ ] **Step 1.8: Commit**

```
git add src/server/flow/gate-evaluation.ts src/server/flow/gate-evaluation.test.ts src/server/runner.ts
git commit -m "Extract gate evaluation helpers to flow/gate-evaluation"
```

---

## Task 2: Move buildStepPrompt to flow/prompt-builder.ts verbatim

Pure file move. No refactor yet. Goal: get the function into its new home with tests still passing, then refactor in Task 3.

**Files:**
- Create: `src/server/flow/prompt-builder.ts`
- Modify: `src/server/runner.ts` — replace `buildStepPrompt` and `formatRagResults` with a re-export

- [ ] **Step 2.1: Create the new file**

Create `src/server/flow/prompt-builder.ts`. Imports at the top:

```
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { supabase } from '../supabase.js';
import { stagedDiff } from '../git-utils.js';
import { discoverSkills } from '../routes/data.js';
import type { FlowConfig, FlowStepConfig } from '../flow-config.js';
```

Then copy `formatRagResults` (currently runner.ts:99-106) verbatim — keep it as a private non-exported helper.

Then copy `buildStepPrompt` (currently runner.ts:109-346) — change `export async function buildStepPrompt(...)` to keep the `export` keyword and paste the ENTIRE 237-line body unchanged. The body spans the opening brace after the parameter list through the closing brace at line 346.

IMPORTANT: do NOT retype the body by hand. Use your editor to select lines 99-346 from the current runner.ts and copy them into the new file, adjusting only the import paths.

- [ ] **Step 2.2: Update runner.ts to re-export**

Edit `src/server/runner.ts`:

1. Delete `formatRagResults` (runner.ts:99-106).
2. Delete `buildStepPrompt` (runner.ts:109-346) — the entire function including `export async function` and closing `}`.
3. Add a re-export in their place:

```
export { buildStepPrompt } from './flow/prompt-builder.js';
```

4. Clean up unused imports. After deletion, verify each:
   - `readFileSync`, `existsSync`, `readdirSync`, `statSync`, `rmSync` — still used by `scanAndUploadArtifacts`. Keep.
   - `join` — still used by `scanAndUploadArtifacts`. Keep.
   - `stagedDiff` — was only used by `buildStepPrompt`. Remove.
   - `stagedDiffStat` — still used by `runFlowJob`. Keep.
   - `discoverSkills` — was only used by `buildStepPrompt`. Remove.

- [ ] **Step 2.3: Run the full test suite**

Run: `pnpm test`
Expected: 199/199 still passing. `runner.test.ts` imports `buildStepPrompt` from `./runner.js` — the re-export keeps it working.

- [ ] **Step 2.4: Typecheck**

Run: `pnpm exec tsc -p tsconfig.app.json --noEmit --pretty false`
Expected: clean. If you see "imported but not used" errors, fix the import cleanup from Step 2.2.

- [ ] **Step 2.5: Line count check**

Run: `wc -l src/server/runner.ts src/server/flow/prompt-builder.ts`
Expected: runner.ts down ~240 lines from 803 → ~565. prompt-builder.ts ~255 lines.

- [ ] **Step 2.6: Commit**

```
git add src/server/flow/prompt-builder.ts src/server/runner.ts
git commit -m "Move buildStepPrompt to flow/prompt-builder"
```

---

## Task 3: Refactor prompt-builder into named helpers

Extract the 12-case switch into named helper functions plus a small `readFileOrEmpty` utility for the repeated "read a file up to 8000 chars, return empty on error" pattern. The main `buildStepPrompt` becomes a linear sequence of helper calls.

**Files:**
- Modify: `src/server/flow/prompt-builder.ts` — refactor into helpers
- Create: `src/server/flow/prompt-builder.test.ts` — focused tests

- [ ] **Step 3.1: Add the readFileOrEmpty utility**

Add near the top of `src/server/flow/prompt-builder.ts` (after imports):

```
function readFileOrEmpty(path: string, maxChars: number): string {
  try {
    return readFileSync(path, 'utf-8').substring(0, maxChars);
  } catch {
    return '';
  }
}
```

- [ ] **Step 3.2: Write tests before refactoring**

Create `src/server/flow/prompt-builder.test.ts` with tests covering:

1. "reads CLAUDE.md when agents context source is requested and CLAUDE.md exists" — write CLAUDE.md to a tmpdir, call buildStepPrompt, assert prompt contains the file contents under `## Repository Instructions`.
2. "prefers AGENTS.md over CLAUDE.md when both exist" — write both, assert only AGENTS.md content appears.
3. "omits the agents block silently when neither file exists" — assert no `## Repository Instructions` header.
4. "includes task title and description when task_description source is set" — assert `## Task`, `Title:`, and `Description:` blocks.
5. "falls back to 'No description provided.' when task.description is null" — assert fallback string.
6. "includes gate_feedback block when task._gateFeedback is set" — assert `## Previous Step Feedback` block.
7. "omits gate_feedback block silently when task._gateFeedback is absent".
8. "includes git_diff block when stagedDiff returns content" — mock stagedDiff, assert `## Git Diff` block.
9. "always ends with the one-line summary instruction" — assert `[summary] Your short summary here` appears.
10. "includes the human answer block when answer is provided" — pass answer arg, assert `## Human Answer to Your Question` appears.

Use `vi.mock('../supabase.js', ...)` to stub out the Supabase client (just enough shape for `.from().select().eq()...` chains to work). Use `vi.mock('../routes/data.js', ...)` for `discoverSkills`. Use `vi.mock('../git-utils.js', ...)` for `stagedDiff`. Create a real tmpdir for filesystem-based tests via `mkdirSync(join(tmpdir(), unique), { recursive: true })` and clean up in `beforeEach`.

Build `baseStep` / `baseFlow` / `baseTask` factory functions at the top of the test file to avoid repeating the boilerplate shape 10 times.

- [ ] **Step 3.3: Run the new tests to confirm they pass against the verbatim move**

Run: `pnpm test src/server/flow/prompt-builder.test.ts`
Expected: PASS, 10 tests. This is the safety net BEFORE refactoring — if any of these fail now, the Task 2 move was wrong.

- [ ] **Step 3.4: Refactor the switch into named helpers**

Replace the current `buildStepPrompt` body with a sequence of helper calls. The new main function builds a `parts: string[]` array, appends blocks, and joins with `\n` at the end. Extract each switch case into its own named private helper function.

Helper functions to create:
- `buildAgentsContext(localPath)` — iterates AGENTS.md then CLAUDE.md, returns `## Repository Instructions\n<content>\n` or null.
- `buildTaskDescriptionContext(task)` — returns `## Task\nTitle: <title>\nDescription: <desc or "No description provided.">\n`.
- `buildTaskImagesContext(task)` — returns `## Attached Images\n<urls joined>\n` or null if none.
- `buildSkillsContext(task, localPath)` — scans task.description for skill refs, calls `discoverSkills`, filters to verified ones, reads each skill file (strips frontmatter, truncates at 8000), returns `## Skills to Apply\n...\n` or null. This is the most complex helper — copy the inner logic from the original switch verbatim.
- `buildFollowupNotesContext(task)` — async; returns `## Rework Feedback\n<notes>\n` plus an optional `## Previously Generated Files\n...` section built from supabase task_artifacts query.
- `buildArchitectureContext(localPath)` — iterates ARCHITECTURE.md then docs/ARCHITECTURE.md, returns `## Architecture Reference\n<content>\n` or null.
- `buildReviewCriteriaContext(localPath)` — reads .codesync/config.json, extracts review_criteria.rules, returns `## Review Criteria\n- rule1\n- rule2\n` or null.
- `buildGitDiffContext(localPath)` — calls stagedDiff, truncates at 12000, wraps in ```diff fence.
- `buildPreviousStepContext(previousOutputs)` — returns `## Previous Step: <phase>\n<output>\n` or null if no outputs.
- `buildGateFeedbackContext(task)` — returns `## Previous Step Feedback (retry reason)\n<task._gateFeedback>\n` or null.
- `buildAllPreviousStepsContext(previousOutputs)` — returns `## Previous Phase Outputs\n### phase1 (attempt N)\n...\n`.
- `buildPreviousArtifactsContext(task)` — async; queries previous task in workstream, fetches its artifacts, builds block with inlined text files or URL refs.
- `buildProjectDataBlock(step, task)` — returns the project data + RAG block (formatted via formatRagResults) or null. This is one of the after-the-switch blocks.

Also extract the after-switch conditionals into inline boolean-guarded appends (they are only 1-2 lines each and do not need their own functions):
- `task.multiagent === 'yes'` → "## Multi-Agent Mode\n..."
- `(task.chaining === 'accept' || task.chaining === 'both') && previousOutputs.length === 0` → "## Artifact Context\n..."
- Always: `## Current Step: <name>\n<instructions>\n`
- `task.chaining === 'produce' || task.chaining === 'both'` → "## File Output\n..."
- `answer` → "## Human Answer to Your Question\n<answer>\n"
- Always end with the summary instructions constant.

The dispatcher function `buildContextSource(source, step, task, previousOutputs, localPath)` is an async private helper that switches on source name and calls the right context helper.

Each helper returns `string | null`. The main loop filters out nulls and joins.

- [ ] **Step 3.5: Run the test file again**

Run: `pnpm test src/server/flow/prompt-builder.test.ts`
Expected: PASS, 10 tests. If any fail, the refactor has a behavior regression — compare against the original switch case in git history.

- [ ] **Step 3.6: Run the full test suite**

Run: `pnpm test`
Expected: 209/209 (199 + 10 new).

- [ ] **Step 3.7: Typecheck**

Run: `pnpm exec tsc -p tsconfig.app.json --noEmit --pretty false`
Expected: clean.

- [ ] **Step 3.8: Commit**

```
git add src/server/flow/prompt-builder.ts src/server/flow/prompt-builder.test.ts
git commit -m "Refactor prompt-builder into named context-source helpers"
```

---

## Task 4: Move runFlowJob and DB helpers to flow/orchestrator.ts

The orchestrator owns `runFlowJob`, its 5 DB helpers, `scanAndUploadArtifacts`, and `summaryRuntimeStep`. They move together to keep the circular-import surface clean.

**Files:**
- Create: `src/server/flow/orchestrator.ts`
- Modify: `src/server/runner.ts` — delete moved code, add re-exports

- [ ] **Step 4.1: Create the new file**

Move from `src/server/runner.ts` into `src/server/flow/orchestrator.ts` verbatim:
- `MIME_MAP` constant (runner.ts:14-19)
- `scanAndUploadArtifacts` (runner.ts:22-75) — KEEP the `export` keyword
- `FlowJobContext` interface (runner.ts:82-97) — KEEP the `export` keyword
- `summaryRuntimeStep` (runner.ts:349-351) — stays PRIVATE
- `runFlowJob` (runner.ts:354-615) — KEEP the `export` keyword
- `isJobStillRunning` (runner.ts:744-752) — stays PRIVATE
- `updateTaskStatus` (runner.ts:755-765) — stays PRIVATE
- `updateRunningJob` (runner.ts:767-779) — stays PRIVATE (and the `JobUpdateResult` type alias that appears earlier in runner.ts)
- `markRunningJobForReview` (runner.ts:781-793) — stays PRIVATE
- `savePhases` (runner.ts:795-803) — stays PRIVATE

Imports at the top of the new file:

```
import { readFileSync, existsSync, readdirSync, statSync, rmSync } from 'fs';
import { join } from 'path';
import { supabase } from '../supabase.js';
import { stagedDiffStat } from '../git-utils.js';
import type { FlowConfig, FlowStepConfig } from '../flow-config.js';
import { buildStepPrompt } from './prompt-builder.js';
import {
  extractPhaseSummary,
  extractVerdict,
  legacyVerifyCheck,
  legacyReviewCheck,
} from './gate-evaluation.js';
import { executeFlowStep, summarize } from '../runtimes/index.js';
```

When copying, adjust any relative imports inside moved code (e.g. `./checkpoint.js` becomes `../checkpoint.js` since we moved one level deeper).

- [ ] **Step 4.2: Update runner.ts — delete moved code, add re-exports**

Edit `src/server/runner.ts`:

1. Delete these items:
   - `MIME_MAP` constant (14-19)
   - `scanAndUploadArtifacts` (22-75)
   - `FlowJobContext` interface (82-97)
   - `summaryRuntimeStep` (349-351)
   - `runFlowJob` (354-615)
   - `isJobStillRunning` (744-752)
   - `updateTaskStatus` (755-765)
   - `updateRunningJob` (767-779)
   - `markRunningJobForReview` (781-793)
   - `savePhases` (795-803)
   - The `JobUpdateResult` type alias if it exists alongside `updateRunningJob`

2. Add re-exports near the top of runner.ts (after the existing re-exports from Tasks 1 and 2):

```
export {
  runFlowJob,
  scanAndUploadArtifacts,
  type FlowJobContext,
} from './flow/orchestrator.js';
```

3. Clean up now-unused imports. After the deletions, verify each:
   - `readFileSync`, `existsSync`, `readdirSync`, `statSync`, `rmSync` — no longer used in runner.ts. Remove.
   - `join` — no longer used. Remove.
   - `supabase` — still used by `cleanupOrphanedJobs`. Keep.
   - `stagedDiffStat` — only used by the deleted `runFlowJob`. Remove.
   - `FlowConfig`, `FlowStepConfig` — still re-exported at runner.ts:80. Keep the re-export but check if runner.ts has any direct type usage; if not, no direct import needed.
   - `getActiveProcessCount` — still used by `cleanupOrphanedJobs`. Keep.
   - `cancelJobImpl`, `cancelAllJobsImpl` — still used for re-exports. Keep.
   - `executeFlowStep`, `summarize` — no longer used in runner.ts. Remove.
   - The gate evaluation imports from Task 1 — no longer used in runner.ts (they now live in orchestrator.ts). Remove from runner.ts.

The final runner.ts should contain only:
- Supabase and process-lifecycle imports for `cleanupOrphanedJobs`
- Re-exports from `./flow/prompt-builder.js`, `./flow/orchestrator.js`, `./process-lifecycle.js`
- Type re-export for `FlowConfig`/`FlowStepConfig`
- `cleanupOrphanedJobs` function
- `cancelJob`/`cancelAllJobs` const re-exports

- [ ] **Step 4.3: Run the full test suite**

Run: `pnpm test`
Expected: 209/209. Critical checks:
- `dispatcher.integration.test.ts` still passes — imports `runFlowJob` and runs it end-to-end.
- `runner.test.ts` still passes — imports `scanAndUploadArtifacts` and `buildStepPrompt` from `./runner.js`.
- `worker.ts` imports `runFlowJob`, `cancelJob`, `cancelAllJobs`, `cleanupOrphanedJobs`, `FlowConfig` from `./runner.js` — re-exports keep it working.

- [ ] **Step 4.4: Typecheck**

Run: `pnpm exec tsc -p tsconfig.app.json --noEmit --pretty false`
Expected: clean.

- [ ] **Step 4.5: Line count check**

Run: `wc -l src/server/runner.ts src/server/flow/orchestrator.ts src/server/flow/prompt-builder.ts src/server/flow/gate-evaluation.ts`
Expected approximately:
- `runner.ts` — 110 to 140 lines
- `orchestrator.ts` — ~440 lines
- `prompt-builder.ts` — ~330 lines
- `gate-evaluation.ts` — ~75 lines

- [ ] **Step 4.6: Commit**

```
git add src/server/flow/orchestrator.ts src/server/runner.ts
git commit -m "Move runFlowJob and DB helpers to flow/orchestrator"
```

---

## Task 5: Extract internal helpers from runFlowJob

`runFlowJob` still contains inline logic for pause detection and gate checking. Extract two private helpers to improve readability. The retry/jump-back decision tree stays inline because it needs too much orchestrator state to factor out cleanly.

**Files:**
- Modify: `src/server/flow/orchestrator.ts` — extract helpers and test-only export
- Create: `src/server/flow/orchestrator.test.ts` — focused unit tests

- [ ] **Step 5.1: Write tests before extracting**

Create `src/server/flow/orchestrator.test.ts` with tests covering:

**detectPauseQuestion** (7 tests):
1. Returns the pause question when the tail contains "Should I".
2. Returns the pause question when the tail contains "Could you".
3. Returns the pause question when the tail contains "Which".
4. Returns null when there is no question mark.
5. Returns null when question keywords are absent even with a question mark.
6. Skips bullet-list and RULES lines when computing the tail.
7. Only looks at the last 5 lines (a question 10 lines back should not fire).

**checkGate** (6 tests):
1. Uses the parsed verdict when present (passing case).
2. Uses the parsed verdict when present (failing case).
3. Falls back to legacyVerifyCheck when no verdict and step name is "verify".
4. Falls back to legacyReviewCheck when no verdict and step name is "review".
5. Uses legacyReviewCheck when context_sources includes "review_criteria" even if step name is not "review".
6. Returns a synthesized reason containing the step name when no verdict reason is present.

The helpers will be private to orchestrator.ts. To test them, expose a test-only object from the orchestrator module:

```
export const __test__ = {
  detectPauseQuestion,
  checkGate,
};
```

And import it in the test file as `import { __test__ } from './orchestrator.js';` then destructure. This pattern is idiomatic for testing internals without making them public.

Mock `../supabase.js` with a minimal stub since orchestrator.ts imports it at module load time.

Use a `baseStep` factory function in the test file to produce minimal `FlowStepConfig` instances.

- [ ] **Step 5.2: Add the private helpers and test-only export**

Inside `src/server/flow/orchestrator.ts`, add (near the top, after imports but before `runFlowJob`):

```
const PAUSE_KEYWORDS = ['Should I', 'Could you', 'Which', 'clarif'];

function detectPauseQuestion(output: string): string | null {
  const candidateLines = output.trim().split('\n').slice(-5).filter(l => {
    const trimmed = l.trim();
    return !trimmed.startsWith('- ') && !trimmed.startsWith('RULES:') && !trimmed.startsWith('IMPORTANT:');
  });
  const lastLines = candidateLines.join('\n');
  if (!lastLines.includes('?')) return null;
  if (!PAUSE_KEYWORDS.some(kw => lastLines.includes(kw))) return null;
  return lastLines;
}

interface GateResult {
  failed: boolean;
  reason: string;
}

function checkGate(step: FlowStepConfig, output: string): GateResult {
  const verdict = extractVerdict(output);
  if (verdict) {
    return {
      failed: !verdict.passed,
      reason: verdict.reason || `${step.name} failed (see output)`,
    };
  }
  const isReview = step.name === 'review' || step.context_sources.includes('review_criteria');
  const failed = isReview ? legacyReviewCheck(output) : legacyVerifyCheck(output);
  return {
    failed,
    reason: `${step.name} failed (see output)`,
  };
}
```

At the bottom of `orchestrator.ts`, add the test-only export:

```
export const __test__ = {
  detectPauseQuestion,
  checkGate,
};
```

- [ ] **Step 5.3: Update runFlowJob to use the new helpers**

Inside `runFlowJob`, replace the inline pause detection block (currently ~lines 424-439 of the moved code):

OLD:
```
const candidateLines = output.trim().split('\n').slice(-5).filter(l => { ... });
const lastLines = candidateLines.join('\n');
if (lastLines.includes('?') && (lastLines.includes('Should I') || ...)) {
  if (await updateRunningJob(jobId, { status: 'paused', question: lastLines, ... }) === 'canceled') return;
  await updateTaskStatus(task.id, 'paused');
  onPause(lastLines);
  return;
}
```

NEW:
```
const pauseQuestion = detectPauseQuestion(output);
if (pauseQuestion) {
  if (await updateRunningJob(jobId, {
    status: 'paused',
    question: pauseQuestion,
    phases_completed: phasesCompleted,
  }) === 'canceled') return;
  await updateTaskStatus(task.id, 'paused');
  onPause(pauseQuestion);
  return;
}
```

Replace the top of the gate check block (currently ~lines 442-448):

OLD:
```
if (step.is_gate) {
  const verdict = extractVerdict(output);
  if (!verdict) console.warn(...);
  const isReview = step.name === 'review' || step.context_sources.includes('review_criteria');
  const failed = verdict ? !verdict.passed : (isReview ? legacyReviewCheck(output) : legacyVerifyCheck(output));
  const reason = verdict?.reason || `${step.name} failed (see output)`;
  // ... retry logic below ...
}
```

NEW:
```
if (step.is_gate) {
  const gateResult = checkGate(step, output);
  const failed = gateResult.failed;
  const reason = gateResult.reason;
  if (failed && !extractVerdict(output)) {
    console.warn(`[runner] Job ${jobId}: gate step '${step.name}' returned no structured verdict, using legacy heuristics`);
  }
  // ... retry logic below (UNCHANGED) ...
}
```

The retry/jump-back/max-attempts decision tree below this point stays inline — it references `displayAttempt`, `maxAttempts`, `steps`, `i`, `totalJumps`, `stepAttemptOffsets`, and mutates `phasesCompleted` / `completedPhaseNames`. Extracting it would require threading all that state through a helper signature.

- [ ] **Step 5.4: Run the orchestrator tests**

Run: `pnpm test src/server/flow/orchestrator.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5.5: Run the full test suite**

Run: `pnpm test`
Expected: 222/222 passing (209 + 13 new).

- [ ] **Step 5.6: Typecheck**

Run: `pnpm exec tsc -p tsconfig.app.json --noEmit --pretty false`
Expected: clean.

- [ ] **Step 5.7: Commit**

```
git add src/server/flow/orchestrator.ts src/server/flow/orchestrator.test.ts
git commit -m "Extract detectPauseQuestion and checkGate helpers in orchestrator"
```

---

## Task 6: Final verification

Read-only verification pass to confirm Phase 2 is complete.

**Files:** none

- [ ] **Step 6.1: Full test suite**

Run: `pnpm test 2>&1 | tail -10`
Expected: 222/222 passing.

- [ ] **Step 6.2: Full typecheck**

Run: `pnpm exec tsc -p tsconfig.app.json --noEmit --pretty false`
Expected: no output.

- [ ] **Step 6.3: Full build**

Run: `pnpm build`
Expected: successful build.

- [ ] **Step 6.4: Line count verification**

Run: `wc -l src/server/runner.ts src/server/flow/*.ts`

Expected approximate counts:
- runner.ts — 110 to 140 lines (down from 803)
- flow/gate-evaluation.ts — ~75 lines
- flow/gate-evaluation.test.ts — ~130 lines
- flow/prompt-builder.ts — ~330 lines
- flow/prompt-builder.test.ts — ~170 lines
- flow/orchestrator.ts — ~460 lines (still big, Phase 3 will thin it)
- flow/orchestrator.test.ts — ~130 lines

- [ ] **Step 6.5: Dead reference scan**

Run: `grep -rn "from '\\./runner\\.js\\|from '\\.\\./runner\\.js" src --include='*.ts'`

Verify each import only references surviving symbols: scanAndUploadArtifacts, buildStepPrompt, runFlowJob, cancelJob, cancelAllJobs, cleanupOrphanedJobs, FlowStepConfig, FlowConfig, FlowJobContext.

- [ ] **Step 6.6: Branch summary**

Run: `git log --oneline main..HEAD`

Expected: 5 commits on branch `workstream/flow-decomposition`.

---

## Self-Review Checklist

**Spec coverage:**
- [x] gate-evaluation.ts — Task 1
- [x] prompt-builder.ts move — Task 2
- [x] prompt-builder.ts refactor into helpers — Task 3
- [x] prompt-builder.test.ts — Task 3
- [x] orchestrator.ts move — Task 4
- [x] Internal helpers extracted from runFlowJob — Task 5
- [x] Focused unit tests for checkGate, detectPauseQuestion — Task 5
- [x] gate-evaluation.test.ts — Task 1
- [x] Final verification — Task 6

**Dependency order:** Task 1 then Task 2 then Task 3 then Task 4 then Task 5 then Task 6. Each task produces working software (tests pass after each commit).

---

## Follow-up plans (not in scope)

**Phase 3 — jobs extraction:** Move `cleanupOrphanedJobs` from runner.ts into `src/server/jobs/`. If `scanAndUploadArtifacts` feels misplaced in the orchestrator, Phase 3 can re-home it. Target: runner.ts to ~30 lines of pure re-exports, or deleted entirely with callers updated.

**Frontend polish:** Pipe `useAiRuntimes.loading` into `FlowStepFormFields` so the runtime dropdown is disabled during the initial fetch. Add `role="alert"` to the `runtimeCatalogError` message div. Independent of Phase 2/3.
