# WorkStream

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-black.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-black.svg)](https://react.dev/)
[![Claude Code](https://img.shields.io/badge/Claude_Code-Powered-black.svg)](https://claude.ai/)

> You describe it. AI builds it. You approve the PR.

Create AI workers with instructions and strict steps. They write code, design pages, draft docs -- and pass output between each other like a real team. Each worker is a composable flow: a sequence of steps with model selection, tool permissions, and context rules. Build them visually.

<img width="1365" height="1048" alt="Screenshot 2026-04-02 at 14 13 22" src="https://github.com/user-attachments/assets/31876ed3-1adf-48b2-8ad0-09930e60f781" />

## How It Works

1. Create a **stream** -- a sequence of tasks that chain output forward
2. Assign each task to an **AI worker** or a human teammate
3. Click **Run** -- tasks execute top-to-bottom, output flows between them
4. Each task auto-commits to the stream's git worktree branch
5. When done, click **Create PR**

Example: designer generates a layout from a screenshot, passes it to copywriter for text, passes it to developer to build it. You add review pauses wherever you want.

## Default Workers

| Worker | Steps | What it does |
|--------|-------|-------------|
| AI Developer | implement -> verify -> review | Plans, codes, tests, reviews |
| AI Bug Hunter | fix -> verify -> review | Root-causes, fixes, proves nothing broke |
| AI Refactorer | refactor -> verify -> review | Restructures, tests, reviews |
| AI Tester | write-tests -> verify -> review | Writes tests, runs them, reviews |

Build your own: designer, copywriter, security auditor, doc writer -- anything you can describe as a sequence of steps.

## Architecture

```
Browser <-> Express API (port 3001) <-> Supabase (Postgres + Auth + Realtime)
               |                              ^
           Vite (port 3000)              Worker process (polls jobs table)
                                              |
                                         Claude Code CLI (claude -p)
                                              |
                                         LM Studio (optional, embeddings)
```

- **Express server** -- stateless HTTP + SSE, serves API and flow CRUD
- **Worker process** -- separate process, polls `jobs` table, spawns `claude -p` per step, writes logs to `job_logs`
- **SSE streaming** -- polls `job_logs` every 500ms, streams to browser
- **Supabase** -- Postgres + Auth + RLS + Realtime (local Docker or cloud)
- **Git worktrees** -- each stream gets `.worktrees/<name>`, isolated from main

## Prerequisites

- **Node.js 18+** and **pnpm**
- **Docker** (for Supabase)
- **Claude Code** -- [install](https://claude.ai/download) and authenticate
- **git** with `user.name` and `user.email` configured
- **GitHub CLI** (optional, for PR creation)
- **LM Studio** (optional, for RAG/embeddings)

## Quick Start

```bash
git clone git@github.com:ilyador/workstream.git
cd workstream && pnpm install
cp .env.example .env

# Start Supabase and apply migrations
npx supabase start
npx supabase db reset

# Fill .env with keys from:
npx supabase status

# Start all services (web + API + worker)
pnpm dev
```

Opens at `http://localhost:3000`. Creates 4 default AI workers on first project setup.

## Telegram Bot

```bash
# Get a token from @BotFather in Telegram
# Add to .env:
TELEGRAM_BOT_TOKEN=your-token-here

# Start the bot
pnpm dev:bot
```

Link a chat to a project with `/start`. Send messages to create tasks, check status, get summaries. Tag the bot in group chats.

## RAG / Document Search

Workers can search your docs, specs, and design files before writing code. Uses local embeddings via LM Studio -- nothing leaves your machine.

```bash
# 1. Start LM Studio and load an embedding model
lms server start
lms load text-embedding-nomic-embed-text-v1.5

# 2. Sync docs from Google Drive (or add files manually)
GDRIVE_CREDENTIALS_PATH=/path/to/credentials.json
GDRIVE_FOLDER_ID=your-folder-id
pnpm gdrive-sync

# 3. Workers now search docs automatically via RAG context
```

Embeddings are stored locally in Supabase with pgvector. Workers get relevant doc chunks injected into their prompts when RAG is enabled.

## MCP Server

```bash
pnpm mcp
```

9 tools: `project_focus`, `project_summary`, `task_create`, `task_update`, `task_log`, `workstream_status`, `job_reply`, `job_approve`, `job_reject`

## Self-Deployed

Everything runs on your infrastructure. Two modes:

- **Local:** run on your machine, sync team through online Supabase
- **VPS:** run on a server, team accesses directly, workers grind 24/7

Your code never touches a third-party server. The only external dependency is the Claude Code CLI.

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19, Vite 8, TypeScript, CSS Modules |
| Backend | Express 5, tsx |
| Database | Supabase (Postgres, Auth, RLS, Realtime) |
| AI | Claude Code CLI (`claude -p`), MCP SDK |
| Embeddings | LM Studio (local, pgvector) |
| Bot | grammy (Telegram) |

## Database

22 migrations in `supabase/migrations/`. Key tables:

- `flows` + `flow_steps` -- AI worker definitions
- `tasks` -- work items with `flow_id` assignment
- `jobs` + `job_logs` -- execution state, frozen `flow_snapshot`, streaming logs
- `workstreams` -- task groups with git worktree branches
- `documents` + `document_chunks` -- RAG corpus with embeddings

All tables use RLS scoped to project membership.

## License

MIT
