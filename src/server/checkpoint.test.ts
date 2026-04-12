import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the git-utils module so we can control what every git invocation
// returns without spawning real processes.
const gitSyncMock = vi.fn();
vi.mock('./git-utils.js', () => ({
  gitSync: (args: string[], cwd: string) => gitSyncMock(args, cwd),
}));

describe('checkpoint', () => {
  beforeEach(() => {
    gitSyncMock.mockReset();
  });

  describe('assertValidJobId (via createCheckpoint)', () => {
    it('rejects job ids with shell-ish characters', async () => {
      const { createCheckpoint } = await import('./checkpoint.js');
      expect(() => createCheckpoint('/path', '--help')).toThrow(/Invalid job id/);
      expect(() => createCheckpoint('/path', 'foo bar')).toThrow(/Invalid job id/);
      expect(() => createCheckpoint('/path', 'foo;rm')).toThrow(/Invalid job id/);
      expect(() => createCheckpoint('/path', 'foo/bar')).toThrow(/Invalid job id/);
      expect(() => createCheckpoint('/path', '')).toThrow(/Invalid job id/);
      // gitSync should not have been called for any of these
      expect(gitSyncMock).not.toHaveBeenCalled();
    });

    it('accepts uuid-shaped ids', async () => {
      // Return a fake SHA for every rev-parse; empty string for everything else.
      gitSyncMock.mockImplementation((args: string[]) => {
        if (args[0] === 'rev-parse') return 'abc1234';
        if (args[0] === 'symbolic-ref') return 'main';
        return '';
      });
      const { createCheckpoint } = await import('./checkpoint.js');
      expect(() => createCheckpoint('/path', '0f3a9c8e-b4e1-4c7b-9f5d-3a8e2c1d6b9f')).not.toThrow();
    });
  });

  describe('createCheckpoint', () => {
    it('captures HEAD, stages all, commits, saves a ref, and resets', async () => {
      gitSyncMock.mockImplementation((args: string[]) => {
        if (args[0] === 'rev-parse') return 'head-sha';
        if (args[0] === 'symbolic-ref') return 'main';
        return '';
      });

      const { createCheckpoint } = await import('./checkpoint.js');
      const info = createCheckpoint('/repo', 'job-1');

      const commands = gitSyncMock.mock.calls.map(([args]) => args[0]);
      // Order of top-level git subcommands the checkpoint path runs
      expect(commands).toEqual([
        'rev-parse',    // head sha
        'symbolic-ref', // current branch
        'add',          // stage all
        'commit',       // checkpoint commit
        'rev-parse',    // commit sha
        'update-ref',   // save the ref
        'config',       // save branch name
        'reset',        // undo the commit
      ]);

      // update-ref receives the expected ref path and commit sha
      const updateRefCall = gitSyncMock.mock.calls.find(([args]) => args[0] === 'update-ref');
      expect(updateRefCall?.[0]).toEqual(['update-ref', 'refs/workstream/checkpoints/job-1', 'head-sha']);

      expect(info).toEqual({ jobId: 'job-1', commitSha: 'head-sha', headSha: 'head-sha', branch: 'main' });
    });

    it('skips the config step when HEAD is detached', async () => {
      gitSyncMock.mockImplementation((args: string[]) => {
        if (args[0] === 'rev-parse') return 'head-sha';
        if (args[0] === 'symbolic-ref') throw new Error('fatal: ref HEAD is not a symbolic ref');
        return '';
      });
      const { createCheckpoint } = await import('./checkpoint.js');
      const info = createCheckpoint('/repo', 'job-1');
      const configCalls = gitSyncMock.mock.calls.filter(([args]) => args[0] === 'config');
      expect(configCalls).toEqual([]);
      expect(info.branch).toBeNull();
    });
  });

  describe('revertToCheckpoint', () => {
    it('throws when the checkpoint ref does not exist', async () => {
      gitSyncMock.mockImplementation((args: string[]) => {
        if (args[0] === 'rev-parse' && args[1] === '--verify') {
          throw new Error('fatal: Needed a single revision');
        }
        return '';
      });
      const { revertToCheckpoint } = await import('./checkpoint.js');
      expect(() => revertToCheckpoint('/repo', 'job-1')).toThrow(/No checkpoint found/);
    });

    it('logs a warning when git clean fails but still reports reverted', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      gitSyncMock.mockImplementation((args: string[]) => {
        if (args[0] === 'clean') throw new Error('permission denied: /repo/.restricted');
        if (args[0] === 'config' && args[1] === `workstream.checkpoint.job-1.branch`) {
          throw new Error('no such key');
        }
        return '';
      });

      const { revertToCheckpoint } = await import('./checkpoint.js');
      const result = revertToCheckpoint('/repo', 'job-1');

      expect(result).toEqual({ reverted: true });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/git clean failed during revert for job job-1/),
        expect.stringMatching(/permission denied/),
      );
      warnSpy.mockRestore();
    });
  });

  describe('deleteCheckpoint', () => {
    it('unsets both the ref and the branch config key', async () => {
      gitSyncMock.mockImplementation(() => '');
      const { deleteCheckpoint } = await import('./checkpoint.js');
      deleteCheckpoint('/repo', 'job-1');

      const subcommands = gitSyncMock.mock.calls.map(([args]) => [args[0], args[1]]);
      expect(subcommands).toContainEqual(['update-ref', '-d']);
      expect(subcommands).toContainEqual(['config', '--unset']);
    });

    it('warns but does not throw when ref deletion fails', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      gitSyncMock.mockImplementation((args: string[]) => {
        if (args[0] === 'update-ref') throw new Error('ref does not exist');
        return '';
      });
      const { deleteCheckpoint } = await import('./checkpoint.js');
      expect(() => deleteCheckpoint('/repo', 'job-1')).not.toThrow();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Failed to delete ref for job job-1/),
        expect.stringMatching(/ref does not exist/),
      );
      warnSpy.mockRestore();
    });
  });
});
