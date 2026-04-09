import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execFileSync } from 'child_process';

// Mock supabase before importing runner
vi.mock('./supabase.js', () => {
  const mockUpload = vi.fn().mockResolvedValue({ data: {}, error: null });
  const mockInsert = vi.fn().mockResolvedValue({ data: {}, error: null });
  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === 'tasks') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { project_id: 'proj-123' }, error: null }),
          };
        }
        if (table === 'task_artifacts') {
          return { insert: mockInsert, upsert: mockInsert };
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
      }),
      storage: {
        from: vi.fn(() => ({
          upload: mockUpload,
        })),
      },
    },
  };
});

// Mock discoverSkills (imported by runner)
vi.mock('./routes/data.js', () => ({
  discoverSkills: vi.fn().mockReturnValue([]),
}));

import { scanAndUploadArtifacts, buildStepPrompt } from './runner.js';
import type { FlowStepConfig, FlowConfig } from './runner.js';
import { supabase } from './supabase.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type UploadCall = [string, unknown, { contentType?: string }];
type TableCall = [string, ...unknown[]];

function makeTempDir(): string {
  const dir = join(tmpdir(), `workstream-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeStep(overrides: Partial<FlowStepConfig> = {}): FlowStepConfig {
  return {
    position: 1,
    name: 'implement',
    instructions: 'Implement the feature.',
    model: 'opus',
    tools: [],
    context_sources: ['task_description'],
    is_gate: false,
    on_fail_jump_to: null,
    max_retries: 0,
    on_max_retries: 'pause',
    ...overrides,
  };
}

function makeFlow(overrides: Partial<FlowConfig> = {}): FlowConfig {
  return {
    flow_name: 'Test Flow',
    agents_md: null,
    provider_binding: 'task_selected',
    steps: [makeStep()],
    ...overrides,
  };
}

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-001',
    title: 'Test task',
    description: 'A test task description',
    project_id: 'proj-123',
    chaining: 'none' as string,
    multiagent: 'auto',
    images: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests: buildStepPrompt — file output instruction
// ---------------------------------------------------------------------------

describe('buildStepPrompt', () => {
  it('includes file output instruction when chaining is "produce"', async () => {
    const task = makeTask({ chaining: 'produce' });
    const step = makeStep();
    const flow = makeFlow();
    const prompt = await buildStepPrompt(step, flow, task, [], '/tmp/fake');
    expect(prompt).toContain('## File Output');
    expect(prompt).toContain('.artifacts/');
  });

  it('includes file output instruction when chaining is "both"', async () => {
    const task = makeTask({ chaining: 'both' });
    const step = makeStep();
    const flow = makeFlow();
    const prompt = await buildStepPrompt(step, flow, task, [], '/tmp/fake');
    expect(prompt).toContain('## File Output');
    expect(prompt).toContain('.artifacts/');
  });

  it('does NOT include file output instruction when chaining is "none"', async () => {
    const task = makeTask({ chaining: 'none' });
    const step = makeStep();
    const flow = makeFlow();
    const prompt = await buildStepPrompt(step, flow, task, [], '/tmp/fake');
    expect(prompt).not.toContain('## File Output');
  });

  it('does NOT include file output instruction when chaining is "accept"', async () => {
    const task = makeTask({ chaining: 'accept' });
    const step = makeStep();
    const flow = makeFlow();
    const prompt = await buildStepPrompt(step, flow, task, [], '/tmp/fake');
    expect(prompt).not.toContain('## File Output');
  });

  it('always includes the task description when context_sources has task_description', async () => {
    const task = makeTask({ chaining: 'produce', title: 'Generate a report', description: 'Write a markdown report' });
    const step = makeStep({ context_sources: ['task_description'] });
    const flow = makeFlow();
    const prompt = await buildStepPrompt(step, flow, task, [], '/tmp/fake');
    expect(prompt).toContain('Generate a report');
    expect(prompt).toContain('Write a markdown report');
    // And still has file output instruction
    expect(prompt).toContain('## File Output');
  });

  it('always injects agents_md when the flow has it', async () => {
    const task = makeTask();
    const flow = makeFlow({ agents_md: 'Use the project agent rules.' });

    const firstPrompt = await buildStepPrompt(makeStep(), flow, task, [], '/tmp/fake');
    const secondPrompt = await buildStepPrompt(makeStep(), flow, task, [], '/tmp/fake');

    expect(firstPrompt).toContain('Use the project agent rules.');
    expect(secondPrompt).toContain('Use the project agent rules.');
  });

  it('reads repo agent instructions from AGENTS.md when requested', async () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'AGENTS.md'), 'Repository agent instructions');

    try {
      const prompt = await buildStepPrompt(
        makeStep({ context_sources: ['agents'] }),
        makeFlow(),
        makeTask(),
        [],
        dir,
      );
      expect(prompt).toContain('Repository agent instructions');
      expect(prompt).toContain('AGENTS.md');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('falls back to CLAUDE.md when AGENTS.md is absent', async () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'CLAUDE.md'), 'Legacy agent instructions');

    try {
      const prompt = await buildStepPrompt(
        makeStep({ context_sources: ['agents'] }),
        makeFlow(),
        makeTask(),
        [],
        dir,
      );
      expect(prompt).toContain('Legacy agent instructions');
      expect(prompt).toContain('CLAUDE.md');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('uses the explicit project id for the RAG CLI hint', async () => {
    const prompt = await buildStepPrompt(
      makeStep({ context_sources: ['rag'] }),
      makeFlow(),
      makeTask({ project_id: undefined }),
      [],
      '/tmp/fake',
      undefined,
      'proj-999',
    );

    expect(prompt).toContain('npx tsx src/server/rag-cli.ts proj-999 "your search query"');
    expect(prompt).not.toContain('undefined "your search query"');
  });
});

// ---------------------------------------------------------------------------
// Tests: scanAndUploadArtifacts
// ---------------------------------------------------------------------------

describe('scanAndUploadArtifacts', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('does nothing when .artifacts/ directory does not exist', async () => {
    const logs: string[] = [];
    await scanAndUploadArtifacts(tempDir, 'task-001', 'job-001', 'implement', (t) => logs.push(t));

    expect(supabase.storage.from).not.toHaveBeenCalled();
    expect(logs).toHaveLength(0);
  });

  it('uploads files from .artifacts/ and creates DB records', async () => {
    const artifactsDir = join(tempDir, '.artifacts');
    mkdirSync(artifactsDir, { recursive: true });
    writeFileSync(join(artifactsDir, 'report.md'), '# My Report\nSome content');
    writeFileSync(join(artifactsDir, 'data.json'), '{"key":"value"}');

    const logs: string[] = [];
    await scanAndUploadArtifacts(tempDir, 'task-001', 'job-001', 'implement', (t) => logs.push(t));

    // Should have uploaded both files
    const storageMock = supabase.storage.from as ReturnType<typeof vi.fn>;
    expect(storageMock).toHaveBeenCalledWith('task-artifacts');

    const uploadMock = storageMock.mock.results[0]?.value.upload as ReturnType<typeof vi.fn>;
    expect(uploadMock).toHaveBeenCalledTimes(2);

    // Verify storage paths include project_id/task_id/filename
    const uploadCalls = uploadMock.mock.calls as UploadCall[];
    const paths = uploadCalls.map(call => call[0]);
    expect(paths).toContain('proj-123/task-001/report.md');
    expect(paths).toContain('proj-123/task-001/data.json');

    // Verify correct MIME types
    const reportCall = uploadCalls.find(call => call[0].includes('report.md'));
    expect(reportCall[2]).toEqual(expect.objectContaining({ contentType: 'text/markdown' }));
    const jsonCall = uploadCalls.find(call => call[0].includes('data.json'));
    expect(jsonCall[2]).toEqual(expect.objectContaining({ contentType: 'application/json' }));

    // Verify DB insert was called for each file
    const fromMock = supabase.from as ReturnType<typeof vi.fn>;
    const artifactInsertCalls = (fromMock.mock.calls as TableCall[]).filter(call => call[0] === 'task_artifacts');
    expect(artifactInsertCalls.length).toBeGreaterThanOrEqual(2);

    // Verify logs
    expect(logs.some(l => l.includes('report.md'))).toBe(true);
    expect(logs.some(l => l.includes('data.json'))).toBe(true);

    // .artifacts/ directory should be cleaned up
    expect(existsSync(artifactsDir)).toBe(false);
  });

  it('detects correct MIME types for various file extensions', async () => {
    const artifactsDir = join(tempDir, '.artifacts');
    mkdirSync(artifactsDir, { recursive: true });
    writeFileSync(join(artifactsDir, 'image.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    writeFileSync(join(artifactsDir, 'doc.pdf'), '%PDF-1.4');
    writeFileSync(join(artifactsDir, 'style.html'), '<html></html>');

    const logs: string[] = [];
    await scanAndUploadArtifacts(tempDir, 'task-001', 'job-001', 'implement', (t) => logs.push(t));

    const storageMock = supabase.storage.from as ReturnType<typeof vi.fn>;
    const uploadMock = storageMock.mock.results[0]?.value.upload as ReturnType<typeof vi.fn>;
    const uploadCalls = uploadMock.mock.calls as UploadCall[];

    const pngCall = uploadCalls.find(call => call[0].includes('image.png'));
    expect(pngCall[2]).toEqual(expect.objectContaining({ contentType: 'image/png' }));

    const pdfCall = uploadCalls.find(call => call[0].includes('doc.pdf'));
    expect(pdfCall[2]).toEqual(expect.objectContaining({ contentType: 'application/pdf' }));

    const htmlCall = uploadCalls.find(call => call[0].includes('style.html'));
    expect(htmlCall[2]).toEqual(expect.objectContaining({ contentType: 'text/html' }));
  });

  it('skips subdirectories inside .artifacts/', async () => {
    const artifactsDir = join(tempDir, '.artifacts');
    mkdirSync(join(artifactsDir, 'subdir'), { recursive: true });
    writeFileSync(join(artifactsDir, 'file.txt'), 'content');
    writeFileSync(join(artifactsDir, 'subdir', 'nested.txt'), 'nested');

    const logs: string[] = [];
    await scanAndUploadArtifacts(tempDir, 'task-001', 'job-001', 'implement', (t) => logs.push(t));

    const storageMock = supabase.storage.from as ReturnType<typeof vi.fn>;
    const uploadMock = storageMock.mock.results[0]?.value.upload as ReturnType<typeof vi.fn>;

    // Only the top-level file should be uploaded (subdir is skipped by isFile() check)
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(uploadMock.mock.calls[0][0]).toBe('proj-123/task-001/file.txt');
  });

  it('cleans up .artifacts/ directory after upload', async () => {
    const artifactsDir = join(tempDir, '.artifacts');
    mkdirSync(artifactsDir, { recursive: true });
    writeFileSync(join(artifactsDir, 'output.csv'), 'a,b,c\n1,2,3');

    await scanAndUploadArtifacts(tempDir, 'task-001', 'job-001', 'implement', () => {});

    expect(existsSync(artifactsDir)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: artifact production works even when task makes no code changes
// ---------------------------------------------------------------------------

describe('artifact production without code changes', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('prompt instructs file production regardless of code changes', async () => {
    // A "produce" task that writes documents (not code) should still
    // get the .artifacts/ instruction even though no source files change
    const task = makeTask({
      chaining: 'produce',
      title: 'Write a design doc',
      description: 'Create a design document for the new API. No code changes needed.',
    });
    const step = makeStep({ context_sources: ['task_description'] });
    const flow = makeFlow();

    const prompt = await buildStepPrompt(step, flow, task, [], tempDir);

    // The file output section must be present
    expect(prompt).toContain('## File Output');
    expect(prompt).toContain('.artifacts/');
    // Task description is included
    expect(prompt).toContain('Write a design doc');
    expect(prompt).toContain('No code changes needed');
  });

  it('scanAndUploadArtifacts captures files even in a repo with no git changes', async () => {
    // Simulate: AI wrote a document to .artifacts/ but touched no source files
    const artifactsDir = join(tempDir, '.artifacts');
    mkdirSync(artifactsDir, { recursive: true });
    writeFileSync(join(artifactsDir, 'design-doc.md'), '# Design Document\n\n## Overview\nThis is the API design.');
    writeFileSync(join(artifactsDir, 'diagram.svg'), '<svg></svg>');

    const logs: string[] = [];
    await scanAndUploadArtifacts(tempDir, 'task-001', 'job-001', 'implement', (t) => logs.push(t));

    // Both files should be captured
    const storageMock = supabase.storage.from as ReturnType<typeof vi.fn>;
    const uploadMock = storageMock.mock.results[0]?.value.upload as ReturnType<typeof vi.fn>;
    expect(uploadMock).toHaveBeenCalledTimes(2);

    const paths = (uploadMock.mock.calls as UploadCall[]).map(call => call[0]);
    expect(paths).toContain('proj-123/task-001/design-doc.md');
    expect(paths).toContain('proj-123/task-001/diagram.svg');

    // Verify MIME types
    const svgCall = (uploadMock.mock.calls as UploadCall[]).find(call => call[0].includes('diagram.svg'));
    expect(svgCall[2]).toEqual(expect.objectContaining({ contentType: 'image/svg+xml' }));

    // Verify logs confirm capture
    expect(logs.some(l => l.includes('design-doc.md') && l.includes('text/markdown'))).toBe(true);
    expect(logs.some(l => l.includes('diagram.svg') && l.includes('image/svg+xml'))).toBe(true);

    // Artifacts dir cleaned up
    expect(existsSync(artifactsDir)).toBe(false);
  });

  it('the full flow: produce task gets instruction + artifacts are captured', async () => {
    // This test verifies the end-to-end scenario:
    // 1. A "produce" task gets the right prompt instruction
    // 2. Files placed in .artifacts/ are scanned and uploaded
    // Even though this task has zero code changes.

    const task = makeTask({
      chaining: 'produce',
      title: 'Generate compliance report',
      description: 'Analyze the codebase and produce a compliance report.',
    });

    // Step 1: Verify prompt instructs file production
    const step = makeStep({ context_sources: ['task_description'] });
    const flow = makeFlow();
    const prompt = await buildStepPrompt(step, flow, task, [], tempDir);
    expect(prompt).toContain('## File Output');
    expect(prompt).toContain('save them to the `.artifacts/` directory');

    // Step 2: Simulate AI producing files (no code changes, just artifacts)
    const artifactsDir = join(tempDir, '.artifacts');
    mkdirSync(artifactsDir, { recursive: true });
    writeFileSync(join(artifactsDir, 'compliance-report.md'), '# Compliance Report\n\nAll checks passed.');

    // Step 3: Scan and upload — this is what happens after all flow steps complete
    const logs: string[] = [];
    await scanAndUploadArtifacts(tempDir, task.id, 'job-001', 'implement', (t) => logs.push(t));

    // Verify the file was captured
    const storageMock = supabase.storage.from as ReturnType<typeof vi.fn>;
    const uploadMock = storageMock.mock.results[0]?.value.upload as ReturnType<typeof vi.fn>;
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(uploadMock.mock.calls[0][0]).toBe('proj-123/task-001/compliance-report.md');

    // Verify log output
    expect(logs.some(l => l.includes('Captured: compliance-report.md'))).toBe(true);
  });

  it('DB record has correct structure for produced artifact', async () => {
    const artifactsDir = join(tempDir, '.artifacts');
    mkdirSync(artifactsDir, { recursive: true });
    const content = '# Architecture\n\nOverview of the system.';
    writeFileSync(join(artifactsDir, 'architecture.md'), content);

    await scanAndUploadArtifacts(tempDir, 'task-042', 'job-099', 'document', () => {});

    const fromMock = supabase.from as ReturnType<typeof vi.fn>;
    const fromCalls = fromMock.mock.calls as TableCall[];
    const artifactCalls = fromCalls.filter(call => call[0] === 'task_artifacts');
    expect(artifactCalls).toHaveLength(1);

    // Get the insert mock and verify the payload
    const insertMock = fromMock.mock.results.find(
      (_result, index) => fromCalls[index]?.[0] === 'task_artifacts',
    )?.value.insert as ReturnType<typeof vi.fn>;
    expect(insertMock).toHaveBeenCalledTimes(1);

    const record = insertMock.mock.calls[0][0];
    expect(record).toEqual({
      task_id: 'task-042',
      job_id: 'job-099',
      phase: 'document',
      filename: 'architecture.md',
      mime_type: 'text/markdown',
      size_bytes: Buffer.byteLength(content),
      storage_path: 'proj-123/task-042/architecture.md',
    });
  });

  it('uses application/octet-stream for unknown file extensions', async () => {
    const artifactsDir = join(tempDir, '.artifacts');
    mkdirSync(artifactsDir, { recursive: true });
    writeFileSync(join(artifactsDir, 'data.xyz'), 'binary-ish data');

    const logs: string[] = [];
    await scanAndUploadArtifacts(tempDir, 'task-001', 'job-001', 'implement', (t) => logs.push(t));

    const storageMock = supabase.storage.from as ReturnType<typeof vi.fn>;
    const uploadMock = storageMock.mock.results[0]?.value.upload as ReturnType<typeof vi.fn>;

    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(uploadMock.mock.calls[0][2]).toEqual(
      expect.objectContaining({ contentType: 'application/octet-stream' }),
    );
    expect(logs.some(l => l.includes('application/octet-stream'))).toBe(true);
  });

  it('continues uploading remaining files when one file fails', async () => {
    const artifactsDir = join(tempDir, '.artifacts');
    mkdirSync(artifactsDir, { recursive: true });
    writeFileSync(join(artifactsDir, 'good.md'), 'good content');
    writeFileSync(join(artifactsDir, 'bad.md'), 'will fail');
    writeFileSync(join(artifactsDir, 'also-good.txt'), 'more content');

    // Get the upload mock by invoking the factory and make it fail for 'bad.md'
    const uploadFn = (supabase.storage.from('task-artifacts') as { upload: ReturnType<typeof vi.fn> }).upload;
    uploadFn.mockImplementation((path: string) => {
      if (path.includes('bad.md')) return Promise.reject(new Error('Upload failed'));
      return Promise.resolve({ data: {}, error: null });
    });

    const logs: string[] = [];
    await scanAndUploadArtifacts(tempDir, 'task-001', 'job-001', 'implement', (t) => logs.push(t));

    // The good files should still be captured
    expect(logs.some(l => l.includes('Captured: good.md'))).toBe(true);
    expect(logs.some(l => l.includes('Captured: also-good.txt'))).toBe(true);
    // The bad file should have a failure log
    expect(logs.some(l => l.includes('Failed to capture bad.md'))).toBe(true);
    expect(existsSync(join(artifactsDir, 'bad.md'))).toBe(true);
    expect(existsSync(join(artifactsDir, 'good.md'))).toBe(false);
    expect(existsSync(join(artifactsDir, 'also-good.txt'))).toBe(false);
  });

  it('treats Supabase upload error results as failures and keeps artifacts for retry', async () => {
    const artifactsDir = join(tempDir, '.artifacts');
    mkdirSync(artifactsDir, { recursive: true });
    writeFileSync(join(artifactsDir, 'report.md'), '# Report');

    const uploadFn = (supabase.storage.from('task-artifacts') as { upload: ReturnType<typeof vi.fn> }).upload;
    uploadFn.mockResolvedValueOnce({ data: null, error: { message: 'Storage unavailable' } });

    const logs: string[] = [];
    await scanAndUploadArtifacts(tempDir, 'task-001', 'job-001', 'implement', (t) => logs.push(t));

    expect(logs.some(l => l.includes('Failed to capture report.md: Storage unavailable'))).toBe(true);
    expect(logs.some(l => l.includes('Leaving .artifacts/ in place'))).toBe(true);
    expect(existsSync(artifactsDir)).toBe(true);
  });

  it('captures artifacts in a git repo with a clean working tree', async () => {
    // Set up a real git repo to verify artifact capture is independent of git state
    execFileSync('git', ['init'], { cwd: tempDir });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: tempDir });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: tempDir });
    writeFileSync(join(tempDir, 'main.ts'), 'console.log("hello")');
    execFileSync('git', ['add', '.'], { cwd: tempDir });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: tempDir });

    // git status is now clean — no code changes at all
    const status = execFileSync('git', ['status', '--porcelain'], { cwd: tempDir, encoding: 'utf-8' }).trim();
    expect(status).toBe('');

    // Simulate AI writing only to .artifacts/ (no code changes)
    const artifactsDir = join(tempDir, '.artifacts');
    mkdirSync(artifactsDir, { recursive: true });
    writeFileSync(join(artifactsDir, 'report.md'), '# Status Report\n\nEverything is fine.');

    const logs: string[] = [];
    await scanAndUploadArtifacts(tempDir, 'task-001', 'job-001', 'implement', (t) => logs.push(t));

    const storMock = supabase.storage.from as ReturnType<typeof vi.fn>;
    const upMock = storMock.mock.results[0]?.value.upload as ReturnType<typeof vi.fn>;
    expect(upMock).toHaveBeenCalledTimes(1);
    expect(upMock.mock.calls[0][0]).toBe('proj-123/task-001/report.md');
    expect(logs.some(l => l.includes('Captured: report.md'))).toBe(true);
  });
});
