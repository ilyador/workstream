# File Chaining for Human Tasks

## Context
File chaining (accept/produce/both) exists for AI tasks but is hidden from human tasks in the UI. Human tasks need the same chaining capability, with enforcement: tasks that accept files can't complete until the upstream file exists, tasks that produce files can't complete until a file is attached.

## Design

### 1. Enable chaining option for human tasks
**File:** `src/web/components/TaskForm.tsx`

Remove the `!assignee` guard on the chaining dropdown. The chaining field already exists on all tasks in the DB -- just unhide it in the form.

### 2. Block completion based on chaining rules
**File:** `src/web/components/TaskCard.tsx` (IdleDetail component)

When rendering the Done button for any task (human or AI):

- **Accept rule** (`chaining === 'accept'` or `'both'`): Look up the previous task in the workstream (by position). Check if it has artifacts via `useArtifacts(prevTaskId)`. If no artifacts exist → disable Done button, show: "Awaiting file from previous task"
- **Produce rule** (`chaining === 'produce'` or `'both'`): Check if the current task has artifacts via `useArtifacts(taskId)`. If no artifacts → disable Done button, show: "Attach a file before completing"

No new API endpoints. Uses existing `useArtifacts` hook and existing `task_artifacts` table.

### 3. Visual indicators

**Task card compact view:** When a task has unsatisfied chaining requirements, show a small file-wait icon (e.g. file + clock) next to the type tag.

**TaskForm edit modal:** When a task has `chaining === 'produce'` or `'both'`, show a yellow warning banner above the attachments/files input area: "This task requires a file attachment before it can be completed"

### What NOT to change
- No backend changes
- No new DB fields
- No changes to the AI chaining flow in runner.ts
- No hardcoded mode checks -- rules apply based on `chaining` field value, not `mode`

### Files to modify
| File | Change |
|------|--------|
| `src/web/components/TaskForm.tsx` | Remove `!assignee` guard on chaining dropdown, add yellow warning |
| `src/web/components/TaskCard.tsx` | Block Done button based on chaining rules, add file-wait icon |
| `src/web/components/WorkstreamColumn.tsx` | Pass previous task's artifacts info for accept checks |

### Verification
1. Create a human task with chaining=produce → Done button blocked until file attached
2. Create a human task with chaining=accept after a task with no artifacts → Done blocked with "Awaiting file" message
3. Attach a file to the producing task → accepting task's Done button unblocks
4. AI tasks with chaining unchanged in behavior
