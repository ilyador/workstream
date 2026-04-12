import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture the tool handler that registerMcpTaskCreateTool installs on the
// MCP server, so we can invoke it directly without spinning up a real server.
type ToolHandler = (args: {
  project_id: string;
  title: string;
  type?: string;
  description?: string;
  workstream_id?: string;
}) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;

interface FakeMcpServer {
  tool: (
    name: string,
    description: string,
    schema: unknown,
    handler: ToolHandler,
  ) => void;
}

// Shared Supabase mock — each test configures what from('table') returns.
const fromMock = vi.fn();
vi.mock('./supabase.js', () => ({
  supabase: {
    from: (table: string) => fromMock(table),
  },
}));

// isMcpProjectAllowed is a simple predicate we stub per-test.
const isMcpProjectAllowedMock = vi.fn();
vi.mock('./mcp-authz.js', () => ({
  isMcpProjectAllowed: (id: unknown) => isMcpProjectAllowedMock(id),
  mcpProjectScopeError: () => 'Error: Project is not allowed for this MCP server.',
  mcpText: (text: string) => ({ content: [{ type: 'text' as const, text }] }),
}));

const getSystemUserIdMock = vi.fn();
vi.mock('./mcp-system-user.js', () => ({
  getSystemUserId: (projectId?: string) => getSystemUserIdMock(projectId),
}));

function createFakeServer(): { server: FakeMcpServer; getHandler: () => ToolHandler } {
  let handler: ToolHandler | null = null;
  const server: FakeMcpServer = {
    tool: (_name, _description, _schema, fn) => {
      handler = fn as ToolHandler;
    },
  };
  return {
    server,
    getHandler: () => {
      if (!handler) throw new Error('tool handler was not registered');
      return handler;
    },
  };
}

// Small DSL for stubbing per-table query chains. Each from('X') call returns
// an object whose shape matches the chained supabase-js calls the tool makes.
function mockTaskInsert(returnValue: { data: unknown; error: unknown }) {
  return {
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(returnValue),
      }),
    }),
  };
}

function mockTaskMaxPosition(returnValue: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue(returnValue),
          }),
        }),
      }),
    }),
  };
}

function mockWorkstreamLookup(returnValue: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(returnValue),
      }),
    }),
  };
}

describe('mcp-task-create-tool', () => {
  beforeEach(() => {
    fromMock.mockReset();
    isMcpProjectAllowedMock.mockReset();
    getSystemUserIdMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function registerAndGetHandler() {
    const { server, getHandler } = createFakeServer();
    const { registerMcpTaskCreateTool } = await import('./mcp-task-create-tool.js');
    registerMcpTaskCreateTool(server as never);
    return getHandler();
  }

  it('rejects requests whose project_id is outside the MCP allowlist', async () => {
    isMcpProjectAllowedMock.mockReturnValue(false);
    const handler = await registerAndGetHandler();

    const result = await handler({ project_id: 'evil', title: 'A' });

    expect(result.content[0].text).toMatch(/not allowed/i);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('rejects an empty/whitespace title', async () => {
    isMcpProjectAllowedMock.mockReturnValue(true);
    const handler = await registerAndGetHandler();

    const result = await handler({ project_id: 'p-1', title: '   ' });

    expect(result.content[0].text).toBe('Error: title is required.');
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('creates a task with the system user id as created_by and position max+1', async () => {
    isMcpProjectAllowedMock.mockReturnValue(true);
    getSystemUserIdMock.mockResolvedValue('system-user-1');
    const taskInsert = mockTaskInsert({
      data: { id: 'task-new', title: 'Ship it' },
      error: null,
    });
    fromMock
      .mockReturnValueOnce(mockTaskMaxPosition({ data: { position: 7 }, error: null }))
      .mockReturnValueOnce(taskInsert);

    const handler = await registerAndGetHandler();
    const result = await handler({
      project_id: 'p-1',
      title: '  Ship it  ',
      type: 'feature',
      description: 'do the thing',
    });

    expect(result.content[0].text).toBe('Created task: Ship it (task-new)');
    expect(getSystemUserIdMock).toHaveBeenCalledWith('p-1');
    expect(taskInsert.insert).toHaveBeenCalledWith({
      project_id: 'p-1',
      title: 'Ship it',
      type: 'feature',
      description: 'do the thing',
      workstream_id: null,
      position: 8,
      created_by: 'system-user-1',
    });
  });

  it('rejects workstream_id that belongs to a different project', async () => {
    isMcpProjectAllowedMock.mockReturnValue(true);
    fromMock.mockReturnValueOnce(mockWorkstreamLookup({
      data: { project_id: 'other-project' },
      error: null,
    }));

    const handler = await registerAndGetHandler();
    const result = await handler({
      project_id: 'p-1',
      title: 'X',
      type: 'feature',
      workstream_id: 'ws-mismatched',
    });

    expect(result.content[0].text).toBe('Error: workstream_id does not belong to project_id');
    // Only the workstream lookup should have run; no task insert.
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it('returns workstream_id not found when the workstream lookup misses', async () => {
    isMcpProjectAllowedMock.mockReturnValue(true);
    fromMock.mockReturnValueOnce(mockWorkstreamLookup({
      data: null,
      error: { code: 'PGRST116', message: 'no rows' },
    }));

    const handler = await registerAndGetHandler();
    const result = await handler({
      project_id: 'p-1',
      title: 'X',
      type: 'feature',
      workstream_id: 'ws-missing',
    });

    expect(result.content[0].text).toBe('Error: workstream_id not found');
  });

  it('swallows raw Supabase error messages on workstream load failure', async () => {
    isMcpProjectAllowedMock.mockReturnValue(true);
    fromMock.mockReturnValueOnce(mockWorkstreamLookup({
      data: null,
      error: { code: 'PGRST500', message: 'permission denied for table workstreams' },
    }));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const handler = await registerAndGetHandler();
    const result = await handler({
      project_id: 'p-1',
      title: 'X',
      type: 'feature',
      workstream_id: 'ws-1',
    });

    expect(result.content[0].text).toBe('Error: failed to load workstream');
    expect(result.content[0].text).not.toMatch(/permission denied/);
    expect(errorSpy).toHaveBeenCalled();

  });

  it('swallows raw Supabase error messages on task insert failure', async () => {
    isMcpProjectAllowedMock.mockReturnValue(true);
    getSystemUserIdMock.mockResolvedValue('system-user-1');
    fromMock
      .mockReturnValueOnce(mockTaskMaxPosition({ data: null, error: { code: 'PGRST116' } }))
      .mockReturnValueOnce(mockTaskInsert({
        data: null,
        error: { message: 'violates check constraint "tasks_type_check"' },
      }));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const handler = await registerAndGetHandler();
    const result = await handler({ project_id: 'p-1', title: 'X', type: 'feature' });

    expect(result.content[0].text).toBe('Error: failed to create task');
    expect(result.content[0].text).not.toMatch(/check constraint/);
    expect(errorSpy).toHaveBeenCalled();

  });

  it('rejects an unknown task type not in core or custom types', async () => {
    isMcpProjectAllowedMock.mockReturnValue(true);
    // Mock custom_task_types query returning empty array
    const customTypesSelect = vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
    }));
    fromMock.mockReturnValueOnce({ select: customTypesSelect });

    const handler = await registerAndGetHandler();
    const result = await handler({ project_id: 'p-1', title: 'X', type: 'invalid-type' });

    expect(result.content[0].text).toMatch(/type must be one of/);
  });

  it('rejects when no system user can be resolved', async () => {
    isMcpProjectAllowedMock.mockReturnValue(true);
    getSystemUserIdMock.mockResolvedValue(null);
    fromMock
      .mockReturnValueOnce(mockTaskMaxPosition({ data: null, error: { code: 'PGRST116' } }));

    const handler = await registerAndGetHandler();
    const result = await handler({ project_id: 'p-1', title: 'X', type: 'feature' });

    expect(result.content[0].text).toMatch(/Could not resolve a system user/);
    // Only the max-position query should have run — no task insert
    expect(fromMock).toHaveBeenCalledTimes(1);
  });
});
