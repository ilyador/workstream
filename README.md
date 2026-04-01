# CodeSync

CodeSync is a project management tool that delegates coding tasks to Claude Code. You create tasks in a web UI, assign them to AI or a human, and CodeSync's execution engine spawns `claude` processes that work through configurable phases (analyze, implement, verify, review) with automatic retries, pause-for-questions, and human approval before merging. An MCP server exposes the same project data to any MCP-compatible client.

## Features

- **Task backlog with focus view** -- prioritized task list with type (feature, bug-fix, refactor, test), effort, and AI/human mode
- **Execution engine** -- spawns Claude Code per task, runs multi-phase pipelines, streams logs via SSE
- **Pause and resume** -- jobs pause automatically when Claude asks a question; you reply through the UI or MCP
- **Review gate** -- completed jobs enter review; approve to mark done, reject to send back to backlog with notes
- **Git integration** -- commit, push, and create branch + PR directly from the UI (uses `gh` CLI)
- **Milestones and progress tracking** -- group tasks into milestones with deadlines
- **Comments and notifications** -- per-task comment threads, DB-triggered notifications on status changes and assignments
- **MCP server** -- `project_focus`, `project_summary`, `task_create`, `task_update`, `task_log`, `milestone_status`, `job_reply`, `job_approve`, `job_reject`
- **Onboarding checks** -- startup screen verifies Claude Code, git, and GitHub CLI are installed and configured
- **Row-level security** -- all Supabase tables use RLS policies scoped to project membership

## Prerequisites

- **Node.js 18+** and **pnpm**
- **Docker** (required by Supabase CLI for local Postgres, Auth, etc.)
- **Claude Code** -- `claude` CLI installed and authenticated ([install](https://claude.com/download))
- **git** -- configured with `user.name` and `user.email`
- **GitHub CLI** (optional) -- needed for the branch + PR feature ([install](https://cli.github.com))

## Quick Start

```bash
# Clone
git clone git@github.com:ilyador/codesync.git
cd codesync

# Install dependencies
pnpm install

# Configure environment
cp .env.example .env
# Edit .env -- fill in after running supabase status below

# Start local Supabase (requires Docker)
npx supabase start

# Apply migrations
npx supabase db reset

# Get your local Supabase keys
npx supabase status
# Copy SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY into .env

# Start dev servers (Vite on :3000, Express on :3001)
pnpm dev

# Open the app
open http://localhost:3000
```

The Vite dev server proxies `/api/*` requests to the Express backend on port 3001.

## Project Structure

```
src/
  server/
    index.ts              Express app entry point
    runner.ts             Execution engine -- spawns claude, manages phases
    mcp.ts                MCP server (stdio transport)
    onboarding.ts         Environment checks (claude, git, gh)
    routes/
      auth.ts             Signup, signin, signout, refresh, me
      data.ts             CRUD for projects, tasks, milestones, jobs, comments, notifications + SSE
      execution.ts        POST /api/run, job SSE stream, reply/approve/reject
      git.ts              Commit, push, branch + PR creation
  web/
    App.tsx               Root component -- onboarding -> auth -> project -> focus view
    components/
      AuthGate.tsx        Login / signup form
      OnboardingCheck.tsx Environment readiness screen
      Header.tsx          Project name, milestone progress, user menu
      FocusView.tsx       Current top task with context
      Backlog.tsx         Ordered task list
      JobsPanel.tsx       Running/paused/review jobs sidebar
      TaskForm.tsx        New task modal
      NewProject.tsx      Project creation screen
    hooks/                useAuth, useProjects, useTasks, useMilestones, useJobs, useComments, useNotifications
    lib/
      api.ts              Fetch wrappers for all endpoints
      focus.ts            Focus task selection logic

supabase/
  migrations/
    00001_foundation.sql              profiles, projects, project_members, RLS
    00002_tasks.sql                   milestones, tasks, task_blockers, RLS
    00003_jobs.sql                    jobs table, RLS
    00004_comments_notifications.sql  comments, notifications, triggers
    00005_review_fixes.sql            RLS fixes, ON DELETE, indexes, trigger improvements
    00006_custom_task_type.sql        drop type CHECK (allow custom types)
    00007_checkpoints.sql             checkpoint_ref, checkpoint_status on jobs
    00008_custom_task_types.sql       custom_task_types table
    00009_final_review_fixes.sql      RLS on custom_task_types, self-block guard, jobs DELETE policy
```

## Task Type Configuration

The execution engine ships with default phase pipelines for `feature`, `bug-fix`, `refactor`, and `test` task types. You can override these per-project by placing a `.codesync/config.json` in your project root:

```json
{
  "task_types": {
    "feature": {
      "phases": ["implement", "verify"],
      "on_verify_fail": "implement",
      "verify_retries": 2,
      "final": "review",
      "on_review_fail": "implement",
      "review_retries": 1,
      "on_max_retries": "pause",
      "phase_config": {
        "implement": { "skill": null, "tools": ["Read", "Edit", "Write", "Bash"], "prompt": "", "model": "opus" },
        "verify": { "skill": null, "tools": ["Bash", "Read"], "prompt": "", "model": "sonnet" },
        "review": { "skill": null, "tools": ["Read", "Grep"], "prompt": "", "model": "sonnet" }
      }
    }
  }
}
```

## MCP Server

The MCP server exposes CodeSync tools over stdio for use with Claude Desktop, Claude Code, or any MCP client.

```bash
pnpm mcp
```

Available tools: `project_focus`, `project_summary`, `task_create`, `task_update`, `task_log`, `milestone_status`, `job_reply`, `job_approve`, `job_reject`.

To add it to Claude Desktop, add this to your MCP config:

```json
{
  "mcpServers": {
    "codesync": {
      "command": "pnpm",
      "args": ["--prefix", "/path/to/codesync", "mcp"],
      "env": {
        "SUPABASE_URL": "http://127.0.0.1:54321",
        "SUPABASE_SERVICE_ROLE_KEY": "your-key"
      }
    }
  }
}
```

## Environment Variables

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Local Supabase URL (default `http://127.0.0.1:54321`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key from `npx supabase status` |
| `PORT` | Express server port (default `3001`) |

## Tech Stack

- **Frontend**: React 19, Vite 8, TypeScript, CSS Modules
- **Backend**: Express 5, tsx
- **Database**: Supabase (Postgres + Auth + RLS)
- **AI**: Claude Code CLI, MCP SDK
- **Tools**: pnpm, concurrently, eslint

## License

MIT
