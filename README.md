# WorkStream

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-black.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-black.svg)](https://react.dev/)
[![Claude Code](https://img.shields.io/badge/Claude_Code-Powered-black.svg)](https://claude.ai/)

> A task manager for people who'd rather not. Your tasks are executable instructions -- AI implements them, you review a PR.

## How It Works

1. Create a **workstream** -- a sequence of tasks that lead to a feature
2. Click **Run** -- Claude Code reads your codebase, implements each task, runs tests
3. Each completed task is auto-committed to the workstream's branch
4. When the workstream is done, click **Create PR**

<img width="1365" height="1048" alt="Screenshot 2026-04-02 at 14 13 22" src="https://github.com/user-attachments/assets/31876ed3-1adf-48b2-8ad0-09930e60f781" />


## Two Ways to Run

### Local Development
Run CodeSync on your machine, sync through an online Supabase instance. Good for solo developers who want AI as a coding partner.

### VPS / Server
Run CodeSync on a VPS with local Supabase. AI grinds tasks 24/7 while you sleep. Good for teams and background automation.

Each workstream gets its own git worktree at `.worktrees/<name>`, so your main checkout stays clean and multiple workstreams can run concurrently without conflicts.

## Features

- **Workstreams** -- sequential task columns, execute top-to-bottom with auto-continue
- **AI execution** -- spawns Claude Code per task with configurable phase pipelines (plan -> implement -> verify -> review)
- **Effort & multi-agent** -- per-task effort level (low/medium/high/max) and optional subagent parallelization
- **Skill references** -- type `/skillname` in task descriptions to inject Claude Code skills into AI prompts, with autocomplete
- **Pause & resume** -- jobs pause when Claude has a question, you answer inline
- **Auto-revert** -- git checkpoint before each task, auto-revert on failure
- **Git integration** -- each workstream gets a worktree, each task = commit, completion = PR
- **Human tasks** -- toggle to human mode for design reviews, manual QA, etc.
- **Image attachments** -- drag-drop or paste screenshots, designs, error captures onto tasks; passed to AI as context
- **Priority levels** -- critical / upcoming / backlog, visible in backlog column
- **Custom task types** -- define project-specific types beyond the built-in set (feature, bug-fix, refactor, test, ui-fix, design, chore)
- **Team roles** -- admin, dev, manager (managers can create and manage tasks but cannot run AI execution)
- **Invite by email** -- invite users who don't have accounts yet; accounts are auto-created
- **Comments & notifications** -- per-task threads, @mentions, web push notifications for status changes
- **Telegram bot** -- interact with your project from Telegram: create tasks, check status, get summaries
- **MCP server** -- `project_focus`, `task_create`, `task_update`, `task_log`, `workstream_status`, `job_reply`, `job_approve`, `job_reject` from CLI
- **Realtime sync** -- SSE + Supabase Realtime (with polling fallback) for live task/job updates across team members
- **Row-level security** -- all Supabase tables use RLS scoped to project membership
- **DB backups** -- included `scripts/backup-db.sh` with pg_dump, gzip, and 7-day retention

## Prerequisites

- **Node.js 18+** and **pnpm**
- **Docker** (for local Supabase)
- **Claude Code** -- [install](https://claude.ai/download) and authenticate
- **git** configured with `user.name` and `user.email`
- **GitHub CLI** -- [install](https://cli.github.com) (needed for PR creation)

## Quick Start

```bash
git clone git@github.com:ilyador/codesync.git
cd codesync
pnpm install
cp .env.example .env

# Start local Supabase
npx supabase start
npx supabase db reset

# Fill .env with keys from:
npx supabase status

# Start all services
pnpm dev
```

Opens at `http://localhost:3000`. The dev command starts Vite (frontend), Express (API), and the worker (task execution) concurrently.

## Architecture

```
Browser <-> Express API <-> Supabase (Postgres)
                              ^
                          Worker polls for jobs
                              |
                          Claude Code CLI
```

- **Express server** -- HTTP/SSE only, stateless, restarts don't affect running jobs
- **Worker process** -- polls DB for queued jobs, spawns `claude -p`, writes logs to `job_logs` table
- **SSE streaming** -- server polls `job_logs` every 500ms, streams to browser via Server-Sent Events
- **Supabase** -- auth, DB, RLS policies, realtime (local Docker or cloud)

## Project Structure

```
src/
  server/
    index.ts          Express entry (port 3001)
    worker.ts         Independent job execution process
    runner.ts         Claude CLI spawner + phase orchestrator
    auto-continue.ts  Shared workstream task queuing
    checkpoint.ts     Git checkpoint create/revert/delete
    worktree.ts       Git worktree management per workstream
    bot.ts            Telegram bot (grammy)
    routes/
      execution.ts    Job lifecycle endpoints + SSE
      data.ts         CRUD for projects, tasks, workstreams, skills
      git.ts          Commit, push, PR endpoints
      auth.ts         Signup, signin, session management
    mcp.ts            MCP server (9 tools)
  web/
    App.tsx           Root component
    components/
      Board.tsx       Kanban board container
      WorkstreamColumn.tsx
      TaskCard.tsx    Card with inline activity
      TaskForm.tsx    Create/edit task modal with skill autocomplete
      Header.tsx      Project switcher, notifications
      LiveLogs.tsx    Real-time job output streaming
    hooks/            useAuth, useTasks, useWorkstreams, useJobs, etc.
    lib/
      api.ts          Fetch wrappers + SSE subscription
scripts/
  backup-db.sh        Database backup with retention
supabase/
  migrations/         16 migration files
```

## Task Configuration

Create `.codesync/config.json` in your project:

```json
{
  "task_types": {
    "feature": {
      "phases": ["plan", "implement", "verify"],
      "final": { "phase": "review" },
      "verify_retries": 2,
      "review_retries": 1
    }
  }
}
```

## Telegram Bot

Set `TELEGRAM_BOT_TOKEN` in `.env`, then:

```bash
pnpm dev:bot
```

Link a chat to a project with `/start`, then send natural language messages to create tasks, check status, or get summaries.

## MCP Server

```bash
pnpm mcp
```

Tools: `project_focus`, `project_summary`, `task_create`, `task_update`, `task_log`, `workstream_status`, `job_reply`, `job_approve`, `job_reject`

## Database Backups

```bash
# Manual backup
./scripts/backup-db.sh

# Backups saved to ~/backups/codesync/ with 7-day retention
# Set up daily cron:
# 0 3 * * * /path/to/codesync/scripts/backup-db.sh >> ~/backups/codesync/cron.log 2>&1
```

## Tech Stack

**Frontend:** React 19, Vite 8, TypeScript, CSS Modules, react-markdown
**Backend:** Express 5, tsx
**Database:** Supabase (Postgres, Auth, RLS, Realtime)
**AI:** Claude Code CLI, MCP SDK
**Bot:** grammy (Telegram)
**Tools:** pnpm, concurrently

## License

MIT
