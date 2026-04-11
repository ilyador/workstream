#!/usr/bin/env tsx
/**
 * Codex smoke test: invokes the actual codex CLI via our driver for each
 * supported model variant with a trivial prompt. Verifies:
 *   1. The model ID is accepted (no "model not found" error)
 *   2. The driver's event parser extracts the agent message from stdout
 *      (not just stderr MCP noise)
 *   3. execute() returns a non-empty string
 *
 *   pnpm smoke:codex
 *
 * This calls the real OpenAI API — small cost per run, ~4 tokens per variant.
 */

import { config } from 'dotenv';
config();

import { codexDriver } from '../src/server/runtimes/codex-driver.js';
import { getAiRuntime } from '../src/shared/ai-runtimes.js';
import type { FlowStepConfig } from '../src/server/flow-config.js';
import { tmpdir } from 'node:os';

const codexRuntime = getAiRuntime('codex');
if (!codexRuntime) {
  console.error('[codex-smoke] codex runtime not found in ai-runtimes.ts');
  process.exit(2);
}

const variants = codexRuntime.variantOptions.map((v) => v.id);
console.log(`[codex-smoke] testing ${variants.length} variants: ${variants.join(', ')}\n`);

interface Result {
  variant: string;
  ok: boolean;
  output: string;
  logContainsAgentText: boolean;
  errorMsg?: string;
  elapsedMs: number;
}

const results: Result[] = [];

for (const variant of variants) {
  const start = Date.now();
  const log: string[] = [];
  const onLog = (text: string): void => {
    log.push(text);
  };

  const step: FlowStepConfig = {
    position: 1,
    name: 'smoke',
    instructions: '',
    runtime_kind: 'coding',
    runtime_id: 'codex',
    runtime_variant: variant,
    tools: [],
    context_sources: [],
    use_project_data: false,
    is_gate: false,
    on_fail_jump_to: null,
    max_retries: 0,
    on_max_retries: 'fail',
  };

  try {
    const output = await codexDriver.execute({
      jobId: `smoke-${variant}-${Date.now()}`,
      step,
      task: { effort: null },
      cwd: tmpdir(),
      prompt: 'Reply with exactly: SMOKE_OK',
      onLog,
    });

    const combinedLog = log.join('');
    // The streaming log should contain the agent's message content,
    // not just stderr MCP noise. Look for either SMOKE_OK (case-insensitive)
    // or any non-stderr structured content.
    const logContainsAgentText =
      /smoke_ok/i.test(combinedLog) ||
      /\[item\.completed\]/.test(combinedLog) ||
      combinedLog.split('\n').some((line) => line.trim() && !/ERROR rmcp/.test(line) && !/^2\d{3}-/.test(line));

    results.push({
      variant,
      ok: /smoke_ok/i.test(output),
      output: output.slice(0, 200),
      logContainsAgentText,
      elapsedMs: Date.now() - start,
    });
  } catch (err) {
    results.push({
      variant,
      ok: false,
      output: '',
      logContainsAgentText: false,
      errorMsg: (err as Error).message,
      elapsedMs: Date.now() - start,
    });
  }
}

// Report
console.log('=== Codex Smoke Test Results ===');
const pad = (s: string, n: number): string => s + ' '.repeat(Math.max(0, n - s.length));

for (const r of results) {
  const outIcon = r.ok ? '✓' : '✗';
  const logIcon = r.logContainsAgentText ? '✓' : '✗';
  const status = r.errorMsg ? `ERROR: ${r.errorMsg}` : `output=${JSON.stringify(r.output)}`;
  console.log(
    `${outIcon} ${pad(r.variant, 20)} (${r.elapsedMs}ms)  log-has-agent-text=${logIcon}  ${status}`,
  );
}

const outputFailures = results.filter((r) => !r.ok);
const logFailures = results.filter((r) => !r.logContainsAgentText);
const passed = results.filter((r) => r.ok && r.logContainsAgentText).length;
console.log(`\n${passed}/${results.length} variants pass`);
if (outputFailures.length > 0) {
  console.log(`   ${outputFailures.length} had wrong output (model may not exist)`);
}
if (logFailures.length > 0) {
  console.log(`   ${logFailures.length} had empty/junk streaming log (event parser broken)`);
}

process.exit(passed === results.length ? 0 : 1);
