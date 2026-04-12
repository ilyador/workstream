import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const gitSyncMock = vi.fn();
vi.mock('./git-utils.js', () => ({
  gitSync: (args: string[], cwd: string) => gitSyncMock(args, cwd),
}));

function tempDir() {
  const dir = join(tmpdir(), `worktree-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('worktree', () => {
  beforeEach(() => {
    gitSyncMock.mockReset();
  });

  describe('workstreamRef', () => {
    it('appends first 8 lowercase alphanumeric chars of the id to the slug', async () => {
      const { workstreamRef } = await import('./worktree.js');
      expect(workstreamRef('build', 'AABB-ccdd-1234')).toBe('build-aabbccdd');
    });

    it('strips non-alphanumeric characters from the id', async () => {
      const { workstreamRef } = await import('./worktree.js');
      expect(workstreamRef('deploy', '---x---')).toBe('deploy-x');
    });

    it('returns just the slug when the id has no alphanumeric chars', async () => {
      const { workstreamRef } = await import('./worktree.js');
      expect(workstreamRef('deploy', '---')).toBe('deploy');
    });
  });

  describe('ensureWorktree', () => {
    it('returns early if the worktree .git already exists', async () => {
      const project = tempDir();
      const refSlug = 'build-abc12345';
      const worktreePath = join(project, '.worktrees', refSlug);
      mkdirSync(worktreePath, { recursive: true });
      writeFileSync(join(worktreePath, '.git'), 'gitdir: ../../.git/worktrees/build-abc12345');

      const { ensureWorktree } = await import('./worktree.js');
      const result = ensureWorktree(project, 'build', 'abc12345-xxxx-yyyy');

      expect(result).toBe(worktreePath);
      expect(gitSyncMock).not.toHaveBeenCalled();
      rmSync(project, { recursive: true, force: true });
    });

    it('runs git worktree add with the branch when worktree does not exist', async () => {
      const project = tempDir();
      gitSyncMock.mockReturnValue('');

      const { ensureWorktree } = await import('./worktree.js');
      const result = ensureWorktree(project, 'build', 'abc12345-xxxx-yyyy');

      const expectedPath = join(project, '.worktrees', 'build-abc12345');
      expect(result).toBe(expectedPath);

      const commands = gitSyncMock.mock.calls.map(([args]: [string[]]) => args[0]);
      expect(commands).toEqual(['worktree', 'branch', 'worktree']);

      const addCall = gitSyncMock.mock.calls.find(([args]: [string[]]) => args[0] === 'worktree' && args[1] === 'add');
      expect(addCall?.[0]).toEqual(['worktree', 'add', expectedPath, 'workstream/build-abc12345']);

      rmSync(project, { recursive: true, force: true });
    });

    it('removes a stale directory before running git worktree add', async () => {
      const project = tempDir();
      const refSlug = 'build-abc12345';
      const worktreePath = join(project, '.worktrees', refSlug);
      mkdirSync(worktreePath, { recursive: true });
      writeFileSync(join(worktreePath, 'stale-file.txt'), 'leftover');

      gitSyncMock.mockReturnValue('');

      const { ensureWorktree } = await import('./worktree.js');
      ensureWorktree(project, 'build', 'abc12345-xxxx-yyyy');

      // The stale directory should have been removed before git worktree add
      // (we can't check deletion order directly, but the git worktree add
      // should have succeeded without throwing)
      const addCall = gitSyncMock.mock.calls.find(([args]: [string[]]) => args[0] === 'worktree' && args[1] === 'add');
      expect(addCall).toBeDefined();

      // Stale file should be gone (rmSync was called before git worktree add)
      expect(existsSync(join(worktreePath, 'stale-file.txt'))).toBe(false);

      rmSync(project, { recursive: true, force: true });
    });

    it('tolerates git branch already-exists error', async () => {
      const project = tempDir();
      gitSyncMock.mockImplementation((args: string[]) => {
        if (args[0] === 'branch') throw new Error('fatal: A branch named workstream/build-abc12345 already exists');
        return '';
      });

      const { ensureWorktree } = await import('./worktree.js');
      expect(() => ensureWorktree(project, 'build', 'abc12345-xxxx-yyyy')).not.toThrow();

      rmSync(project, { recursive: true, force: true });
    });
  });

  describe('cleanupWorktree', () => {
    it('runs prune, worktree remove --force, and branch -d', async () => {
      const project = tempDir();
      gitSyncMock.mockReturnValue('');

      const { cleanupWorktree } = await import('./worktree.js');
      cleanupWorktree(project, 'build', 'abc12345-xxxx-yyyy');

      const commands = gitSyncMock.mock.calls.map(([args]: [string[]]) => `${args[0]} ${args[1]}`);
      expect(commands).toContain('worktree prune');
      expect(commands).toContain('worktree remove');
      expect(commands).toContain('branch -d');

      const removeCall = gitSyncMock.mock.calls.find(([args]: [string[]]) => args[0] === 'worktree' && args[1] === 'remove');
      expect(removeCall?.[0]).toContain('--force');

      rmSync(project, { recursive: true, force: true });
    });

    it('does not throw if every git command fails', async () => {
      const project = tempDir();
      gitSyncMock.mockImplementation(() => { throw new Error('nope'); });

      const { cleanupWorktree } = await import('./worktree.js');
      expect(() => cleanupWorktree(project, 'build', 'abc12345-xxxx-yyyy')).not.toThrow();

      rmSync(project, { recursive: true, force: true });
    });
  });
});
