# SSE Real-Time Coverage Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the SSE real-time sync gaps identified in the audit: missing reloads in two client hooks, three unbroadcast DB tables (notifications, rag_documents, project_data), and duplicate custom-type broadcasts.

**Architecture:** The existing SSE system is project-scoped: one EventSource per project with events like `task_changed`, `flow_changed`, etc. We add three new event types (`notification_changed`, `document_changed`, `project_data_changed`) emitted via the same `broadcast(projectId, event)` path. For notifications (user-scoped table), the handler resolves `project_id` via a DB lookup against the referenced task or workstream. Client hooks that own the data subscribe via `subscribeProjectEvents` and refetch.

**Tech Stack:** Node.js + Express, Supabase (postgres_changes for DB triggers), React hooks, vitest for tests.

**Out of scope:** Cross-tab sync for the `projects` list itself. That is user-scoped (each user has their own list) and would require a user-scoped SSE channel — a larger refactor tracked separately.

---

## File Structure

**New files:**
- `src/server/realtime-notification-handler.ts` — handler for notifications postgres_changes with DB project_id lookup
- `src/server/realtime-notification-handler.test.ts` — unit tests for the handler
- `src/server/realtime-document-handler.ts` — handler for rag_documents postgres_changes
- `src/server/realtime-document-handler.test.ts` — unit tests for the handler

**Modified files:**
- `src/web/hooks/useWorkstreamExecutionActions.ts` — add reload after `reviewAndCreatePr()` (Task 1)
- `src/web/hooks/useFlows.ts` — add reload to `updateFlowSteps` (Task 2)
- `src/server/routes/custom-type-create.ts` — remove duplicate manual broadcast (Task 3)
- `src/server/routes/custom-type-delete.ts` — remove duplicate manual broadcast (Task 3)
- `src/server/realtime-change-handlers.ts` — export new handlers (Tasks 4, 6)
- `src/server/realtime-channel.ts` — subscribe `notifications` and `rag_documents` tables (Tasks 4, 6)
- `src/web/hooks/useProjectEvents.ts` — add new event types to `ProjectEvent` union (Tasks 4, 5, 6)
- `src/server/routes/project-data-settings.ts` — manual broadcast after PATCH (Task 5)
- `src/web/hooks/useProjectDataSettings.ts` — subscribe to `project_data_changed` event (Task 5)
- `src/web/components/ProjectDataRoute.tsx` — subscribe to `document_changed` and `project_data_changed` events, reload (Tasks 4, 5)
- `src/web/hooks/useNotifications.ts` — accept `currentProjectId`, subscribe to `notification_changed`, reduce polling (Task 6)
- `src/web/App.tsx` — pass `projects.current?.id` to `useNotifications` (Task 6)

---

## Task 1: Fix createPr review reload

**Files:**
- Modify: `src/web/hooks/useWorkstreamExecutionActions.ts:21-34`

- [ ] **Step 1: Read the current implementation**

```bash
cat src/web/hooks/useWorkstreamExecutionActions.ts
```

Expected: file contents matching `createPr` callback at lines 21-34 with `if (options?.review)` branch that awaits `reviewAndCreatePr()` without calling `workstreams.reload()`.

- [ ] **Step 2: Add reload call to the review branch**

Edit `src/web/hooks/useWorkstreamExecutionActions.ts` — change the `createPr` callback body so BOTH branches call `workstreams.reload()`:

```typescript
  const createPr = useCallback(async (workstreamId: string, options?: { review?: boolean }) => {
    try {
      if (options?.review) {
        await reviewAndCreatePr(workstreamId, localPath || '');
        await workstreams.reload();
      } else {
        const result = await createWorkstreamPr(workstreamId, localPath || '');
        if (result.prUrl) {
          await workstreams.reload();
        }
      }
    } catch (err) {
      await modal.alert('Error', getErrorMessage(err, 'Failed'));
    }
  }, [localPath, modal, workstreams]);
```

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/web/hooks/useWorkstreamExecutionActions.ts
git commit -m "fix(sse): reload workstreams after reviewAndCreatePr"
```

---

## Task 2: Fix updateFlowSteps reload

**Files:**
- Modify: `src/web/hooks/useFlows.ts:63-65`

- [ ] **Step 1: Add reload to updateFlowSteps**

Edit `src/web/hooks/useFlows.ts` — update `updateFlowSteps` to await a reload and include `load` in deps:

```typescript
  const updateFlowSteps = useCallback(async (flowId: string, steps: FlowStepInput[]) => {
    await apiUpdateSteps(flowId, steps);
    await load();
  }, [load]);
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Run existing flow hook tests**

Run: `npx vitest run src/web/components/FlowEditor.test.tsx src/web/components/FlowStepFormFields.test.tsx`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/web/hooks/useFlows.ts
git commit -m "fix(sse): reload flows after updating flow steps"
```

---

## Task 3: Remove duplicate custom-type broadcasts

**Files:**
- Modify: `src/server/routes/custom-type-create.ts:30`
- Modify: `src/server/routes/custom-type-delete.ts` (find manual broadcast line)

The postgres_changes listener for `custom_task_types` in `realtime-channel.ts:21` already calls `broadcastCustomTypeChange`. Manual broadcasts in these routes duplicate the event.

- [ ] **Step 1: Remove manual broadcast from custom-type-create.ts**

Edit `src/server/routes/custom-type-create.ts`:

```typescript
// Remove line 4: import { broadcast } from '../realtime.js';
// Remove line 30: broadcast(project_id, { type: 'custom_type_changed', custom_type: data });
```

After edit, the bottom of the handler should look like:

```typescript
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});
```

- [ ] **Step 2: Read custom-type-delete.ts and remove its manual broadcast**

```bash
cat src/server/routes/custom-type-delete.ts
```

Remove the `import { broadcast }` line and the `broadcast(...)` call. The handler should only delete from supabase and return the result.

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (unused-import removal should not create a lint failure).

- [ ] **Step 4: Commit**

```bash
git add src/server/routes/custom-type-create.ts src/server/routes/custom-type-delete.ts
git commit -m "fix(sse): drop duplicate custom-type broadcasts"
```

---

## Task 4: Add rag_documents real-time broadcasts

**Files:**
- Create: `src/server/realtime-document-handler.ts`
- Create: `src/server/realtime-document-handler.test.ts`
- Modify: `src/server/realtime-change-handlers.ts`
- Modify: `src/server/realtime-channel.ts`
- Modify: `src/web/hooks/useProjectEvents.ts`

- [ ] **Step 1: Write the failing test for broadcastDocumentChange**

Create `src/server/realtime-document-handler.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';

const broadcastMock = vi.hoisted(() => vi.fn());
vi.mock('./realtime-listeners.js', () => ({
  broadcast: broadcastMock,
}));

import { broadcastDocumentChange } from './realtime-document-handler.js';

describe('broadcastDocumentChange', () => {
  beforeEach(() => {
    broadcastMock.mockClear();
  });

  it('broadcasts document_changed with project_id from the new record on insert/update', () => {
    broadcastDocumentChange({
      eventType: 'INSERT',
      new: { id: 'doc-1', project_id: 'proj-1', file_name: 'spec.md' },
      old: null,
    });
    expect(broadcastMock).toHaveBeenCalledWith('proj-1', { type: 'document_changed' });
  });

  it('falls back to old record on DELETE', () => {
    broadcastDocumentChange({
      eventType: 'DELETE',
      new: {},
      old: { id: 'doc-1', project_id: 'proj-1' },
    });
    expect(broadcastMock).toHaveBeenCalledWith('proj-1', { type: 'document_changed' });
  });

  it('does not broadcast when project_id is missing', () => {
    broadcastDocumentChange({
      eventType: 'INSERT',
      new: { id: 'doc-1' },
      old: null,
    });
    expect(broadcastMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/realtime-document-handler.test.ts`
Expected: FAIL — module `./realtime-document-handler.js` does not exist.

- [ ] **Step 3: Implement the handler**

Create `src/server/realtime-document-handler.ts`:

```typescript
import { broadcast } from './realtime-listeners.js';
import { projectRecord, stringField, type RealtimePayload } from './realtime-payload.js';

export function broadcastDocumentChange(payload: RealtimePayload): void {
  const record = projectRecord(payload);
  const projectId = stringField(record, 'project_id');
  if (!projectId) return;
  broadcast(projectId, { type: 'document_changed' });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/realtime-document-handler.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Export from realtime-change-handlers.ts**

Edit `src/server/realtime-change-handlers.ts` to add the new export. The file becomes:

```typescript
export {
  broadcastJobChange,
  broadcastTaskChange,
  broadcastTaskScopedChange,
  broadcastWorkstreamChange,
} from './realtime-core-handlers.js';
export {
  broadcastFlowChange,
  broadcastFlowStepChange,
} from './realtime-flow-handlers.js';
export {
  broadcastCustomTypeChange,
  broadcastMemberChange,
} from './realtime-project-handlers.js';
export { broadcastDocumentChange } from './realtime-document-handler.js';
```

- [ ] **Step 6: Subscribe rag_documents in realtime-channel.ts**

Edit `src/server/realtime-channel.ts` — add `broadcastDocumentChange` to the imports at the top of the file, and add one `.on()` line before `.subscribe((status) => ...`:

```typescript
import {
  broadcastCustomTypeChange,
  broadcastDocumentChange,
  broadcastFlowChange,
  broadcastFlowStepChange,
  broadcastJobChange,
  broadcastMemberChange,
  broadcastTaskChange,
  broadcastTaskScopedChange,
  broadcastWorkstreamChange,
} from './realtime-change-handlers.js';
```

Then add this line in `startRealtimeChannel()` after the `task_artifacts` line (current line 25):

```typescript
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rag_documents' }, broadcastDocumentChange)
```

- [ ] **Step 7: Check that rag_documents is in the supabase_realtime publication**

Run: `grep -rn "rag_documents" supabase/migrations/`
Expected: verify there's a line `alter publication supabase_realtime add table rag_documents` somewhere; if not, note it.

If missing, create `supabase/migrations/00027_rag_documents_realtime.sql`:

```sql
alter publication supabase_realtime add table rag_documents;
```

(Only create the migration if the grep shows no such line already.)

- [ ] **Step 8: Add event type to client ProjectEvent union**

Edit `src/web/hooks/useProjectEvents.ts` — add to the `ProjectEvent` type union:

```typescript
export type ProjectEvent =
  | { type: 'task_changed'; task: TaskRecord }
  | { type: 'task_deleted'; task: TaskRecord }
  | { type: 'job_changed'; job: JobRecord }
  | { type: 'job_deleted'; job: JobRecord }
  | { type: 'artifact_changed'; task_id: string }
  | { type: 'artifact_deleted'; task_id: string }
  | { type: 'comment_changed'; task_id: string }
  | { type: 'comment_deleted'; task_id: string }
  | { type: 'flow_changed'; flow: Flow }
  | { type: 'flow_deleted'; flow_id: string }
  | { type: 'workstream_changed'; workstream: WorkstreamRecord }
  | { type: 'workstream_deleted'; workstream_id: string }
  | { type: 'member_changed' }
  | { type: 'custom_type_changed' }
  | { type: 'document_changed' }
  | { type: 'full_sync' }
  | { type: 'unknown' };
```

- [ ] **Step 9: Subscribe to document_changed in ProjectDataRoute**

Edit `src/web/components/ProjectDataRoute.tsx` — add `subscribeProjectEvents` import at the top (near the other hook/lib imports):

```typescript
import { subscribeProjectEvents } from '../hooks/useProjectEvents';
```

Then add this useEffect inside the component body, AFTER the existing `useEffect` that calls `loadAll`:

```typescript
  useEffect(() => {
    const unsub = subscribeProjectEvents(project.id, (event) => {
      if (event.type === 'document_changed' || event.type === 'full_sync') {
        void loadAll();
      }
    });
    return unsub;
  }, [project.id, loadAll]);
```

- [ ] **Step 10: Run tests and typecheck**

Run: `npx vitest run src/server/realtime-document-handler.test.ts src/web/components/ProjectDataRoute.test.tsx && npx tsc --noEmit`
Expected: all tests pass, no type errors.

- [ ] **Step 11: Commit**

```bash
git add src/server/realtime-document-handler.ts src/server/realtime-document-handler.test.ts src/server/realtime-change-handlers.ts src/server/realtime-channel.ts src/web/hooks/useProjectEvents.ts src/web/components/ProjectDataRoute.tsx
# Also add the migration if step 7 created one
git commit -m "feat(sse): broadcast rag_documents changes in real time"
```

---

## Task 5: Add project_data_settings real-time broadcasts

**Files:**
- Modify: `src/server/routes/project-data-settings.ts:91`
- Modify: `src/web/hooks/useProjectEvents.ts`
- Modify: `src/web/components/ProjectDataRoute.tsx` (extend existing subscription from Task 4)
- Modify: `src/web/hooks/useProjectDataSettings.ts`

Settings are stored as columns on the `projects` table, so subscribing to the `projects` table in realtime-channel.ts would fire for unrelated updates (rename, local_path changes). Instead we emit a narrow event by manually broadcasting from the PATCH route after the update succeeds.

- [ ] **Step 1: Add manual broadcast in the PATCH route**

Edit `src/server/routes/project-data-settings.ts` — add `broadcast` import and call it before `res.json(...)` at line 90-91:

```typescript
import { broadcast } from '../realtime.js';
```

Then after the update succeeds (after `if (error) return ...;`) and after the optional reindex block, update the final `res.json(...)` block:

```typescript
  const settings = projectDataSettingsFromRecord(data);
  broadcast(projectId, { type: 'project_data_changed' });
  res.json({ ...settings, reindex });
});
```

The local `settings` variable is a new binding — don't try to reuse the spread expression inline.

- [ ] **Step 2: Add event type to ProjectEvent union**

Edit `src/web/hooks/useProjectEvents.ts` — add to the union:

```typescript
  | { type: 'project_data_changed' }
```

(Place it near `document_changed` from Task 4.)

- [ ] **Step 3: Extend ProjectDataRoute subscription**

Edit `src/web/components/ProjectDataRoute.tsx` — extend the useEffect added in Task 4 to also reload on `project_data_changed`:

```typescript
  useEffect(() => {
    const unsub = subscribeProjectEvents(project.id, (event) => {
      if (event.type === 'document_changed' || event.type === 'project_data_changed' || event.type === 'full_sync') {
        void loadAll({ reloadSettings: true });
      }
    });
    return unsub;
  }, [project.id, loadAll]);
```

Note `reloadSettings: true` — settings may have changed so we need to refetch them, not just documents.

- [ ] **Step 4: Subscribe in useProjectDataSettings hook**

Edit `src/web/hooks/useProjectDataSettings.ts` — add subscription so the parent hook ALSO refreshes when settings change (parent consumers outside ProjectDataRoute stay in sync):

```typescript
import { useEffect } from 'react';
import { getProjectDataSettings, type ProjectDataSettings } from '../lib/api';
import { useProjectResource } from './useProjectResource';
import { subscribeProjectEvents } from './useProjectEvents';

const EMPTY_SETTINGS: ProjectDataSettings = {
  enabled: false,
  backend: 'lmstudio',
  baseUrl: 'http://localhost:1234/v1',
  embeddingModel: 'text-embedding-nomic-embed-text-v1.5',
  topK: 5,
};

export function useProjectDataSettings(projectId: string | null) {
  const {
    data,
    setData,
    loading,
    error,
    ready,
    reload,
  } = useProjectResource(projectId, getProjectDataSettings, {
    createInitialValue: () => EMPTY_SETTINGS,
    getErrorMessage: (err) => err instanceof Error ? err.message : 'Failed to load Project Data settings',
  });

  useEffect(() => {
    void reload();
  }, [projectId, reload]);

  useEffect(() => {
    if (!projectId) return;
    const unsub = subscribeProjectEvents(projectId, (event) => {
      if (event.type === 'project_data_changed' || event.type === 'full_sync') {
        void reload();
      }
    });
    return unsub;
  }, [projectId, reload]);

  return {
    settings: data,
    setSettings: setData,
    loading,
    error,
    ready,
    reload,
  };
}
```

- [ ] **Step 5: Run typecheck and relevant tests**

Run: `npx tsc --noEmit && npx vitest run src/web/components/ProjectDataRoute.test.tsx`
Expected: no errors, tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/server/routes/project-data-settings.ts src/web/hooks/useProjectEvents.ts src/web/hooks/useProjectDataSettings.ts src/web/components/ProjectDataRoute.tsx
git commit -m "feat(sse): broadcast project data settings changes"
```

---

## Task 6: Add notifications real-time broadcasts

**Files:**
- Create: `src/server/realtime-notification-handler.ts`
- Create: `src/server/realtime-notification-handler.test.ts`
- Modify: `src/server/realtime-change-handlers.ts`
- Modify: `src/server/realtime-channel.ts`
- Modify: `src/web/hooks/useProjectEvents.ts`
- Modify: `src/web/hooks/useNotifications.ts`
- Modify: `src/web/App.tsx`

Notifications are user-scoped (have `user_id`, not `project_id`), but each one references either a `task_id` or `workstream_id`. The handler resolves `project_id` by querying the referenced row. For notifications without either reference, we skip the broadcast (polling catches them).

- [ ] **Step 1: Write the failing test for broadcastNotificationChange**

Create `src/server/realtime-notification-handler.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';

const broadcastMock = vi.hoisted(() => vi.fn());
const supabaseMock = vi.hoisted(() => {
  const single = vi.fn();
  const eq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { from, select, eq, single };
});

vi.mock('./realtime-listeners.js', () => ({
  broadcast: broadcastMock,
}));
vi.mock('./supabase.js', () => ({
  supabase: { from: supabaseMock.from },
}));

import { broadcastNotificationChange } from './realtime-notification-handler.js';

describe('broadcastNotificationChange', () => {
  beforeEach(() => {
    broadcastMock.mockClear();
    supabaseMock.from.mockClear();
    supabaseMock.single.mockReset();
  });

  it('resolves project_id via task lookup and broadcasts notification_changed', async () => {
    supabaseMock.single.mockResolvedValueOnce({ data: { project_id: 'proj-1' }, error: null });

    await broadcastNotificationChange({
      eventType: 'INSERT',
      new: { id: 'n1', user_id: 'u1', task_id: 't1', type: 'mention' },
      old: null,
    });

    expect(supabaseMock.from).toHaveBeenCalledWith('tasks');
    expect(broadcastMock).toHaveBeenCalledWith('proj-1', { type: 'notification_changed' });
  });

  it('resolves project_id via workstream lookup when task_id is absent', async () => {
    supabaseMock.single.mockResolvedValueOnce({ data: { project_id: 'proj-2' }, error: null });

    await broadcastNotificationChange({
      eventType: 'INSERT',
      new: { id: 'n2', user_id: 'u1', workstream_id: 'w1', type: 'review_request' },
      old: null,
    });

    expect(supabaseMock.from).toHaveBeenCalledWith('workstreams');
    expect(broadcastMock).toHaveBeenCalledWith('proj-2', { type: 'notification_changed' });
  });

  it('falls back to old record on DELETE', async () => {
    supabaseMock.single.mockResolvedValueOnce({ data: { project_id: 'proj-3' }, error: null });

    await broadcastNotificationChange({
      eventType: 'DELETE',
      new: {},
      old: { id: 'n3', user_id: 'u1', task_id: 't1' },
    });

    expect(broadcastMock).toHaveBeenCalledWith('proj-3', { type: 'notification_changed' });
  });

  it('does not broadcast when neither task_id nor workstream_id is present', async () => {
    await broadcastNotificationChange({
      eventType: 'INSERT',
      new: { id: 'n4', user_id: 'u1', type: 'system' },
      old: null,
    });
    expect(supabaseMock.from).not.toHaveBeenCalled();
    expect(broadcastMock).not.toHaveBeenCalled();
  });

  it('does not broadcast when the DB lookup fails', async () => {
    supabaseMock.single.mockResolvedValueOnce({ data: null, error: { message: 'not found' } });

    await broadcastNotificationChange({
      eventType: 'INSERT',
      new: { id: 'n5', user_id: 'u1', task_id: 't1' },
      old: null,
    });
    expect(broadcastMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/realtime-notification-handler.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the handler**

Create `src/server/realtime-notification-handler.ts`:

```typescript
import { broadcast } from './realtime-listeners.js';
import { projectRecord, stringField, type RealtimePayload } from './realtime-payload.js';
import { supabase } from './supabase.js';

async function resolveProjectId(table: 'tasks' | 'workstreams', id: string): Promise<string | null> {
  const { data, error } = await supabase
    .from(table)
    .select('project_id')
    .eq('id', id)
    .single();
  if (error || !data) return null;
  const projectId = (data as { project_id?: unknown }).project_id;
  return typeof projectId === 'string' && projectId.length > 0 ? projectId : null;
}

export async function broadcastNotificationChange(payload: RealtimePayload): Promise<void> {
  const record = projectRecord(payload);
  const taskId = stringField(record, 'task_id');
  const workstreamId = stringField(record, 'workstream_id');

  let projectId: string | null = null;
  if (taskId) {
    projectId = await resolveProjectId('tasks', taskId);
  } else if (workstreamId) {
    projectId = await resolveProjectId('workstreams', workstreamId);
  }
  if (!projectId) return;

  broadcast(projectId, { type: 'notification_changed' });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/realtime-notification-handler.test.ts`
Expected: 5 tests pass.

- [ ] **Step 5: Export and subscribe**

Edit `src/server/realtime-change-handlers.ts` — add the export:

```typescript
export { broadcastNotificationChange } from './realtime-notification-handler.js';
```

Edit `src/server/realtime-channel.ts` — add `broadcastNotificationChange` to imports and add a new `.on()` line. Note: the Supabase channel callback is synchronous; wrap the async handler in an arrow like the flow handlers do:

```typescript
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, async payload => broadcastNotificationChange(payload))
```

Place it after the `task_artifacts` line and after the rag_documents line from Task 4.

- [ ] **Step 6: Check notifications in realtime publication**

Run: `grep -n "notifications" supabase/migrations/*.sql | grep publication`
Expected: verify that `alter publication supabase_realtime add table notifications` exists (migration 00004 adds it at line 73). No action needed.

- [ ] **Step 7: Add event type to ProjectEvent union**

Edit `src/web/hooks/useProjectEvents.ts` — add to the union:

```typescript
  | { type: 'notification_changed' }
```

- [ ] **Step 8: Update useNotifications to subscribe and reduce polling**

Edit `src/web/hooks/useNotifications.ts` to accept an optional `currentProjectId`, subscribe to that project's notification events, and reduce polling to 60s as a cross-project fallback:

```typescript
import { useState, useEffect, useCallback } from 'react';
import { getNotifications, markNotificationRead, markAllNotificationsRead, type NotificationRecord } from '../lib/api';
import { subscribeProjectEvents } from './useProjectEvents';

export function useNotifications(userId: string | undefined, currentProjectId: string | null) {
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await getNotifications();
      setNotifications(data);
    } catch { /* ignore */ }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    queueMicrotask(() => {
      void load();
    });
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [userId, load]);

  useEffect(() => {
    if (!userId || !currentProjectId) return;
    const unsub = subscribeProjectEvents(currentProjectId, (event) => {
      if (event.type === 'notification_changed' || event.type === 'full_sync') {
        void load();
      }
    });
    return unsub;
  }, [userId, currentProjectId, load]);

  const unreadCount = notifications.filter(n => !n.read).length;

  async function markRead(id: string) {
    await markNotificationRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }

  async function markAllRead() {
    await markAllNotificationsRead();
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }

  return { notifications, unreadCount, markRead, markAllRead };
}
```

- [ ] **Step 9: Pass current project id from App.tsx**

Edit `src/web/App.tsx` line 29 to pass the current project id:

```typescript
  const notifs = useNotifications(auth.profile?.id, projects.current?.id ?? null);
```

- [ ] **Step 10: Run all touched tests and typecheck**

Run: `npx tsc --noEmit && npx vitest run src/server/realtime-notification-handler.test.ts`
Expected: no type errors, 5 tests pass.

- [ ] **Step 11: Commit**

```bash
git add src/server/realtime-notification-handler.ts src/server/realtime-notification-handler.test.ts src/server/realtime-change-handlers.ts src/server/realtime-channel.ts src/web/hooks/useProjectEvents.ts src/web/hooks/useNotifications.ts src/web/App.tsx
git commit -m "feat(sse): broadcast notification changes via project scope"
```

---

## Task 7: Final verification

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 3: Verify no remaining references to duplicate broadcasts**

Run: `grep -rn "broadcast.*custom_type_changed" src/server/routes/`
Expected: zero matches — confirms Task 3 removed both manual broadcasts.

- [ ] **Step 4: Verify all new event types are handled**

Run: `grep -n "document_changed\|project_data_changed\|notification_changed" src/web/hooks/useProjectEvents.ts`
Expected: three matches in the ProjectEvent union.

- [ ] **Step 5: Final commit if any cleanup was needed**

```bash
git status
# If clean, skip. Otherwise address any leftover changes and commit.
```
