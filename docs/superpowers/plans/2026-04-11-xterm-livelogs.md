# xterm.js LiveLogs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain `<div>`-per-line rendering inside `LiveLogs` with an xterm.js terminal so that ANSI colors, bold, spinners, and cursor-redraw output from Claude Code, Codex, and Qwen Code render faithfully.

**Architecture:** Keep the existing SSE subscription (`subscribeToJob`) and connection-status footer unchanged. Extract a pure `formatLogEvent` helper that maps each SSE event type to an ANSI-formatted string (TDD'd with plain asserts), then rewrite the body of `LiveLogs` to mount one `Terminal` into a container ref and pipe every callback through `formatLogEvent` into `term.write`. Placeholders ("Waiting for output…", "No output yet") move to a CSS overlay positioned over the terminal container so they don't pollute scrollback. A `ResizeObserver` + `FitAddon` keeps the terminal sized to the surrounding card. Theme is resolved at mount time from `[data-theme]`; a live theme-switch does not re-theme the terminal (deliberate trade-off — users rarely swap themes while watching a run).

**Tech Stack:** React 18 + TypeScript, Vite, CSS Modules, Vitest + jsdom, `@xterm/xterm` 5.x, `@xterm/addon-fit`.

**Scope / YAGNI:** Read-only terminal (`disableStdin: true`). No PTY, no bidirectional input. No theme-switch reactivity. No new test harness for canvas rendering — only the pure formatter is unit-tested; the component integration is verified manually in the browser.

---

## File Structure

- **Modify:** `package.json` — add `@xterm/xterm`, `@xterm/addon-fit` deps.
- **Create:** `src/web/components/live-logs-format.ts` — pure `formatLogEvent(event)` helper returning ANSI-formatted strings. One responsibility: SSE-event-to-terminal-bytes.
- **Create:** `src/web/components/live-logs-format.test.ts` — vitest unit tests for the formatter.
- **Modify:** `src/web/components/LiveLogs.tsx` — rewrite the render body to mount xterm; keep the subscription wiring and footer JSX.
- **Modify:** `src/web/components/LiveLogs.module.css` — replace `.logBox`/`.logLine`/`.logPhase` with `.terminalBox`/`.terminalContainer`/`.placeholder` rules; keep `.logFooter` + connection bar classes.

---

## Task 1: Add xterm.js dependencies

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`

- [ ] **Step 1: Install xterm packages**

Run: `pnpm add @xterm/xterm @xterm/addon-fit`
Expected: both packages resolve, `pnpm-lock.yaml` updated, `package.json` `dependencies` gains the two entries. No peer warnings for React 18.

- [ ] **Step 2: Verify typecheck baseline still passes**

Run: `npx tsc --noEmit`
Expected: exit 0, no output.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add @xterm/xterm and @xterm/addon-fit for LiveLogs"
```

---

## Task 2: Pure `formatLogEvent` helper (TDD)

A single pure function that converts every SSE callback payload into a ready-to-write ANSI string. All ANSI escape sequences live here — the component just calls `term.write(formatLogEvent(event))`. Testable with plain string comparisons — no canvas, no DOM.

**Files:**
- Create: `src/web/components/live-logs-format.ts`
- Create: `src/web/components/live-logs-format.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `src/web/components/live-logs-format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatLogEvent } from './live-logs-format';

// ANSI escape shorthands for readability
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const BLUE = '\x1b[34m';

describe('formatLogEvent', () => {
  it('passes a raw log line through verbatim and terminates with CRLF', () => {
    expect(formatLogEvent({ kind: 'log', text: 'hello world' })).toBe('hello world\r\n');
  });

  it('preserves existing ANSI escapes inside raw log text', () => {
    const withAnsi = `${RED}error:${RESET} broken`;
    expect(formatLogEvent({ kind: 'log', text: withAnsi })).toBe(`${withAnsi}\r\n`);
  });

  it('formats phase-start as bold cyan with a ▸ prefix', () => {
    expect(formatLogEvent({ kind: 'phase-start', phase: 'plan', attempt: 1 })).toBe(
      `${BOLD}${CYAN}▸ Phase: plan${RESET}\r\n`,
    );
  });

  it('includes attempt count when attempt > 1', () => {
    expect(formatLogEvent({ kind: 'phase-start', phase: 'fix', attempt: 3 })).toBe(
      `${BOLD}${CYAN}▸ Phase: fix (attempt 3)${RESET}\r\n`,
    );
  });

  it('appends dim description line when phase has a known description', () => {
    expect(formatLogEvent({ kind: 'phase-start', phase: 'plan', attempt: 1 })).toContain(
      `${DIM}Planning implementation approach...${RESET}\r\n`,
    );
  });

  it('omits description for unknown phase names', () => {
    const out = formatLogEvent({ kind: 'phase-start', phase: 'unknown-phase', attempt: 1 });
    expect(out).toBe(`${BOLD}${CYAN}▸ Phase: unknown-phase${RESET}\r\n`);
  });

  it('formats phase-complete as green with ✓ prefix', () => {
    expect(formatLogEvent({ kind: 'phase-complete', phase: 'plan' })).toBe(
      `${BOLD}${GREEN}✓ Phase: plan complete${RESET}\r\n`,
    );
  });

  it('formats pause as yellow with ⏸ prefix', () => {
    expect(formatLogEvent({ kind: 'pause', question: 'continue?' })).toBe(
      `${BOLD}${YELLOW}⏸ Paused: continue?${RESET}\r\n`,
    );
  });

  it('formats review as blue with ◆ prefix', () => {
    expect(formatLogEvent({ kind: 'review' })).toBe(
      `${BOLD}${BLUE}◆ Ready for review${RESET}\r\n`,
    );
  });

  it('formats done as green with ✓ prefix', () => {
    expect(formatLogEvent({ kind: 'done' })).toBe(
      `${BOLD}${GREEN}✓ Done${RESET}\r\n`,
    );
  });

  it('formats fail as red with ✗ prefix and error text', () => {
    expect(formatLogEvent({ kind: 'fail', error: 'spawn ENOENT' })).toBe(
      `${BOLD}${RED}✗ Failed: spawn ENOENT${RESET}\r\n`,
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/web/components/live-logs-format.test.ts`
Expected: FAIL — "Failed to load url .../live-logs-format" or "Cannot find module".

- [ ] **Step 3: Implement `formatLogEvent`**

Create `src/web/components/live-logs-format.ts`:

```ts
/** Human-readable descriptions for phase names. */
const PHASE_DESCRIPTIONS: Record<string, string> = {
  plan: 'Planning implementation approach...',
  analyze: 'Analyzing the codebase...',
  implement: 'Implementing changes...',
  fix: 'Fixing the issue...',
  verify: 'Running tests to verify...',
  review: 'Reviewing code quality...',
  refactor: 'Refactoring code...',
  'write-tests': 'Writing tests...',
};

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const BLUE = '\x1b[34m';
const EOL = '\r\n';

export type LogEvent =
  | { kind: 'log'; text: string }
  | { kind: 'phase-start'; phase: string; attempt: number }
  | { kind: 'phase-complete'; phase: string }
  | { kind: 'pause'; question: string }
  | { kind: 'review' }
  | { kind: 'done' }
  | { kind: 'fail'; error: string };

export function formatLogEvent(event: LogEvent): string {
  switch (event.kind) {
    case 'log':
      return `${event.text}${EOL}`;
    case 'phase-start': {
      const suffix = event.attempt > 1 ? ` (attempt ${event.attempt})` : '';
      const header = `${BOLD}${CYAN}▸ Phase: ${event.phase}${suffix}${RESET}${EOL}`;
      const description = PHASE_DESCRIPTIONS[event.phase];
      return description ? `${header}${DIM}${description}${RESET}${EOL}` : header;
    }
    case 'phase-complete':
      return `${BOLD}${GREEN}✓ Phase: ${event.phase} complete${RESET}${EOL}`;
    case 'pause':
      return `${BOLD}${YELLOW}⏸ Paused: ${event.question}${RESET}${EOL}`;
    case 'review':
      return `${BOLD}${BLUE}◆ Ready for review${RESET}${EOL}`;
    case 'done':
      return `${BOLD}${GREEN}✓ Done${RESET}${EOL}`;
    case 'fail':
      return `${BOLD}${RED}✗ Failed: ${event.error}${RESET}${EOL}`;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/web/components/live-logs-format.test.ts`
Expected: PASS — 11 tests passing.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0, no output.

- [ ] **Step 6: Commit**

```bash
git add src/web/components/live-logs-format.ts src/web/components/live-logs-format.test.ts
git commit -m "feat(live-logs): extract pure formatLogEvent helper with ANSI output"
```

---

## Task 3: Rewrite `LiveLogs.tsx` to mount xterm.js

Replace the state-driven div-per-line rendering with a single xterm `Terminal`. Keep `subscribeToJob` and the connection footer JSX identical. Resolve theme once at mount. Track `hasOutput` so the "Waiting for output…" overlay can hide on first write.

**Files:**
- Modify: `src/web/components/LiveLogs.tsx` (full rewrite of the component body, keep imports/exports shape)

- [ ] **Step 1: Replace the file contents**

Overwrite `src/web/components/LiveLogs.tsx`:

```tsx
import { useState, useEffect, useRef } from 'react';
import { Terminal, type ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { subscribeToJob } from '../lib/api';
import type { ConnectionState } from '../lib/api';
import { formatLogEvent } from './live-logs-format';
import s from './LiveLogs.module.css';

/** Resolve the terminal theme from the current [data-theme] attribute on <html>.
 *  Captured once at mount; live theme switches do not re-theme the terminal. */
function resolveTerminalTheme(): ITheme {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (isDark) {
    return {
      background: '#00000000',
      foreground: '#A8A8A0',
      cursor: '#A8A8A0',
      black: '#1A1A18',
      red: '#F07070',
      green: '#34D058',
      yellow: '#E09B3D',
      blue: '#6EA8E6',
      magenta: '#C586C0',
      cyan: '#6EB8C2',
      white: '#E8E8E4',
      brightBlack: '#4A4A47',
      brightRed: '#F48F8F',
      brightGreen: '#5BDD7A',
      brightYellow: '#EAB365',
      brightBlue: '#88BBF0',
      brightMagenta: '#D3A6D3',
      brightCyan: '#88CAD1',
      brightWhite: '#FFFFFF',
    };
  }
  return {
    background: '#00000000',
    foreground: '#555555',
    cursor: '#555555',
    black: '#1A1A1A',
    red: '#B91C1C',
    green: '#16A34A',
    yellow: '#CA8A04',
    blue: '#2D6FBF',
    magenta: '#8E44AD',
    cyan: '#0E7490',
    white: '#1A1A1A',
    brightBlack: '#888888',
    brightRed: '#DC2626',
    brightGreen: '#22C55E',
    brightYellow: '#EAB308',
    brightBlue: '#4A88D0',
    brightMagenta: '#A855F7',
    brightCyan: '#0891B2',
    brightWhite: '#1A1A1A',
  };
}

/** Shows live SSE log lines for a running job using xterm.js. */
export function LiveLogs({ jobId, footer }: { jobId: string; footer?: React.ReactNode }) {
  const [connState, setConnState] = useState<ConnectionState>('connecting');
  const [connVisible, setConnVisible] = useState(true);
  const [hasConnected, setHasConnected] = useState(false);
  const [hasOutput, setHasOutput] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref mirror of hasOutput so the subscription callback can check it
  // synchronously without closing over a stale React state value.
  const hasOutputRef = useRef(false);

  useEffect(() => {
    hasOutputRef.current = hasOutput;
  }, [hasOutput]);

  // Mount the terminal once. The SSE subscription is wired in a second
  // effect keyed on jobId so switching jobs doesn't tear down the terminal.
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      convertEol: true,
      cursorBlink: false,
      cursorStyle: 'underline',
      disableStdin: true,
      fontFamily: "ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, Consolas, monospace",
      fontSize: 11,
      lineHeight: 1.55,
      scrollback: 500,
      allowTransparency: true,
      theme: resolveTerminalTheme(),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    terminalRef.current = term;
    fitRef.current = fit;

    const resizeObserver = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        // ResizeObserver can fire during unmount; swallow.
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      term.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
  }, []);

  // Wire up the SSE subscription. Reset terminal + state on jobId change.
  useEffect(() => {
    const term = terminalRef.current;
    if (!term) return;

    term.reset();
    hasOutputRef.current = false;
    setHasOutput(false);
    setConnState('connecting');
    setConnVisible(true);
    setHasConnected(false);

    const write = (text: string) => {
      if (!hasOutputRef.current) {
        hasOutputRef.current = true;
        setHasOutput(true);
      }
      term.write(text);
    };

    const unsub = subscribeToJob(jobId, {
      onLog: (text) => write(formatLogEvent({ kind: 'log', text })),
      onPhaseStart: (phase, attempt) => write(formatLogEvent({ kind: 'phase-start', phase, attempt })),
      onPhaseComplete: (phase) => write(formatLogEvent({ kind: 'phase-complete', phase })),
      onPause: (question) => write(formatLogEvent({ kind: 'pause', question })),
      onReview: () => write(formatLogEvent({ kind: 'review' })),
      onDone: () => write(formatLogEvent({ kind: 'done' })),
      onFail: (error) => write(formatLogEvent({ kind: 'fail', error })),
      onConnectionChange: (state) => {
        setConnState(state);
        setConnVisible(true);
        if (state === 'open') setHasConnected(true);
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        if (state === 'open') {
          hideTimerRef.current = setTimeout(() => setConnVisible(false), 2000);
        }
      },
    });

    return () => {
      unsub();
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [jobId]);

  const connLabel = connState === 'connecting'
    ? (hasConnected ? 'Reconnecting...' : 'Connecting...')
    : connState === 'open' ? 'Connected'
    : 'Connection lost';

  const showConn = connState !== 'open' || connVisible;

  return (
    <>
      <div className={s.terminalBox}>
        <div ref={containerRef} className={s.terminalContainer} />
        {!hasOutput && (
          <span className={s.placeholder}>
            {connState === 'connecting' ? 'Waiting for output...' : 'Claude is working... output will appear when the phase completes.'}
          </span>
        )}
      </div>
      <div className={s.logFooter}>
        <div className={`${s.connBar} ${s[`conn${connState.charAt(0).toUpperCase()}${connState.slice(1)}`]} ${!showConn ? s.connHidden : ''}`}>
          <span className={s.connDot} />
          {connLabel}
        </div>
        {footer}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0. If TypeScript complains about `ITheme` import — the type is exported from `@xterm/xterm`; double-check version 5.x is installed.

- [ ] **Step 3: Lint**

Run: `npx eslint src/web/components/LiveLogs.tsx src/web/components/live-logs-format.ts`
Expected: exit 0. Fix any `react-hooks/exhaustive-deps` warnings by either adding the dep or adding an eslint-disable-line comment with a justification.

- [ ] **Step 4: Run the full web test suite to confirm no regressions**

Run: `npx vitest run src/web`
Expected: all tests pass. Note: LiveLogs has no direct tests, but neighboring components that import it should still compile.

- [ ] **Step 5: Commit**

```bash
git add src/web/components/LiveLogs.tsx
git commit -m "feat(live-logs): render output via xterm.js with ANSI support"
```

---

## Task 4: Swap in terminal-friendly CSS

Replace the old `.logBox`/`.logLine`/`.logPhase` rules with `.terminalBox`/`.terminalContainer`/`.placeholder`. Keep `.logFooter` + the connection-bar classes unchanged.

**Files:**
- Modify: `src/web/components/LiveLogs.module.css`

- [ ] **Step 1: Replace the log-box block**

Open `src/web/components/LiveLogs.module.css`. Replace the existing `.logBox`, `.logLine`, `.logPhase`, `.noOutput`, `.waitingOutput` rules (lines 32–79 in the current file) with:

```css
/* --- Live logs (xterm.js) --- */
.terminalBox {
  position: relative;
  max-height: 240px;
  height: 240px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--surface-strong) 82%, var(--blue-bg)), var(--surface-strong));
  border: 1px solid color-mix(in srgb, var(--blue) 12%, var(--divider));
  border-radius: 12px;
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--white) 80%, transparent), 0 8px 22px rgba(20, 20, 18, 0.04);
  padding: 12px 14px;
  overflow: hidden;
}

.terminalContainer {
  width: 100%;
  height: 100%;
}

/* xterm paints its viewport absolutely inside the container; override its
 * defaults so the surrounding card's background shows through. */
.terminalContainer :global(.xterm),
.terminalContainer :global(.xterm-viewport),
.terminalContainer :global(.xterm-screen) {
  background: transparent !important;
}

.terminalContainer :global(.xterm-viewport) {
  /* Use the same subtle scrollbar treatment as the page scrollbar. */
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--divider) 88%, transparent) transparent;
}

.placeholder {
  position: absolute;
  left: 14px;
  top: 14px;
  color: var(--text-4);
  font-family: var(--font);
  font-size: 12px;
  font-style: italic;
  pointer-events: none;
}

@media (max-width: 768px) {
  .terminalBox {
    max-height: 200px;
    height: 200px;
    padding: 10px 12px;
  }
}
```

- [ ] **Step 2: Verify the footer/connection classes are untouched**

Run: `grep -n "\.logFooter\|\.connBar\|\.connDot\|\.connOpen\|\.connConnecting\|\.connError\|\.connHidden" src/web/components/LiveLogs.module.css`
Expected: each selector still present. These are still referenced from `LiveLogs.tsx`.

- [ ] **Step 3: Typecheck + lint to confirm no dangling class references**

Run: `npx tsc --noEmit && npx eslint src/web/components/LiveLogs.tsx`
Expected: exit 0 from both. TypeScript will NOT catch missing CSS-module keys by default, so also grep:

Run: `grep -n "s\.logBox\|s\.logLine\|s\.logPhase\|s\.noOutput\|s\.waitingOutput" src/web/components/LiveLogs.tsx`
Expected: zero matches.

- [ ] **Step 4: Commit**

```bash
git add src/web/components/LiveLogs.module.css
git commit -m "feat(live-logs): style terminal container with transparent xterm viewport"
```

---

## Task 5: Manual browser verification

No automated tests for the component integration — xterm.js requires a real canvas/WebGL surface, and jsdom stubs canvas. Verify in the running dev server.

**Files:** none (verification only).

- [ ] **Step 1: Make sure the dev server is running**

Run: `pnpm dev` (in a separate terminal if not already running). Wait for Vite to print "ready in …".

- [ ] **Step 2: Open a project with a running or recently-run job**

Navigate to a project workspace in the browser (default http://localhost:3000) and open any task whose job page shows the `LiveLogs` panel. Look for a job that has emitted real output — ideally one that went through multiple phases so phase banners are visible.

- [ ] **Step 3: Verify the five visual checks**

For each of the below, note pass/fail:

1. **ANSI color**: output lines that originally included `\x1b[31m` (or any color) appear colored, not as raw escape text.
2. **Phase banners**: phase headers render in bold cyan with the `▸` prefix and a dim description line underneath.
3. **Placeholder**: when the job first loads with no output, "Waiting for output..." shows as an italic overlay; it disappears the instant the first line is written.
4. **Scrolling**: long output auto-sticks to the bottom as lines arrive; scrolling up pauses auto-scroll (xterm's built-in behavior).
5. **Resize**: shrinking the browser window re-fits the terminal columns without clipping.

- [ ] **Step 4: Toggle color scheme**

In the app's theme switcher (or via `document.documentElement.setAttribute('data-theme', 'dark')` in the devtools console), swap to dark mode. Reload the page. Verify the terminal palette adapts (background stays transparent, foreground is legible against the darker card).

Expected trade-off documented in architecture note: live theme toggling without reload will NOT re-theme the terminal until the job page is re-mounted. Record this as expected behavior.

- [ ] **Step 5: Kill a job and confirm no console errors**

Cancel or complete a running job. Navigate away from the task page. Check the browser console — no errors from xterm disposal, no `ResizeObserver` warnings, no memory-leak warnings.

- [ ] **Step 6: Commit the plan's completion marker**

If all five checks passed and no console errors, the integration is done. No code commit for this task — just update your worktree status. If a check failed, create a follow-up task in the repo's tracker describing the failure precisely (which check, what you saw, what you expected).

---

## Task 6: Remove stale reference to defunct phase-class types

The old implementation stored a per-line `type: 'log' | 'phase' | 'status'` discriminator on React state. That state is gone. Grep to confirm nothing outside `LiveLogs` imported that shape (it was a local literal, so this should be a no-op safety check).

**Files:** none expected.

- [ ] **Step 1: Confirm no external references**

Run: `grep -rn "type: 'log' | 'phase' | 'status'\|LogLine\|logLines" src/`
Expected: zero matches. If anything shows up, it's orphaned code to delete in a follow-up.

- [ ] **Step 2: Final full-suite sanity check**

Run: `npx vitest run && npx tsc --noEmit && npx eslint src`
Expected: all green. This is the "we're done" gate.

---

## Self-review checklist (run before handing off)

- **Spec coverage:** Every requirement from the conversation — ANSI rendering, in-place swap, theme match, placeholder, scroll, resize, cleanup — is covered by Tasks 2–5.
- **Placeholder scan:** No "TBD", no "fill in later", every code block is complete.
- **Type consistency:** `LogEvent` is defined in Task 2 and used identically in Task 3. `formatLogEvent` signature is the same in both tasks. `ITheme` is imported from `@xterm/xterm` consistently.
- **File paths:** All paths are absolute from the repo root and match the existing layout.

---

## Rollback plan

If the xterm integration reveals a blocker (canvas rendering bug, memory leak, accessibility regression) after the feature lands:

```bash
git revert <task-3-commit> <task-4-commit>
pnpm remove @xterm/xterm @xterm/addon-fit
```

The `formatLogEvent` helper and its tests can stay — they're inert without the component calling them and may be reused by a future terminal renderer.
