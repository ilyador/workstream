# WorkStream

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-black.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-black.svg)](https://react.dev/)
[![Opencode Code](https://img.shields.io/badge/Opencode_Code-Powered-black.svg)](https://opencode.ai/)

> A task manager where the tasks do themselves.

## AI Workers

WorkStream lets you build AI workers and assign them tasks like you'd assign a teammate. A worker is a composable flow -- a sequence of steps with instructions, model selection, tool access, and context rules. You build them visually, no config files.

Ships with four:

- **AI Developer** -- plans and implements features
- **AI Bug Hunter** -- analyzes and fixes bugs
- **AI Refactorer** -- restructures code without breaking behavior
- **AI Tester** -- writes test suites following your existing patterns

But those are just defaults. Build your own: an AI designer that generates layouts from Figma screenshots. A copywriter that drafts release notes from your git log. A security auditor that reviews diffs against OWASP. Hook up RAG with local embeddings and your workers can search your docs, specs, and design files before writing a single line of code. The flow editor is visual -- drag steps, toggle models, pick what context each step sees.

<img width="1365" height="1048" alt="Screenshot 2026-04-02 at 14 13 22" src="https://github.com/user-attachments/assets/31876ed3-1adf-48b2-8ad0-09930e60f781" />

## How It Works

1. Create a **stream** -- a sequence of tasks that lead to a feature
2. Assign each task to an **AI worker** or a human
3. Click **Run** -- the worker reads your codebase, does the work, runs tests
4. Each completed task is auto-committed to the stream's branch
5. When the stream is done, click **Create PR**

Workers only get the context they need. The execute step gets your OPENCODE.md, skills, and project files. The verify step gets "run tests" and nothing else (~200 tokens). The review step gets the git diff and architecture docs -- fresh eyes that never saw the implementation. Roughly half the tokens of sending everything everywhere.

## What Else

- **Pause & resume** -- workers pause when stuck, you answer inline, they continue
- **Auto-revert** -- git checkpoint before each task, rolls back on failure
- **Git worktrees** -- each stream gets its own branch, main stays clean
- **Human tasks** -- assign to people for design reviews, QA, manual work
- **Skills** -- type `/skillname` in descriptions to inject methodologies
- **Realtime** -- watch workers execute live, push notifications when done
- **Telegram bot** -- create tasks from your phone, check status from bed
- **MCP server** -- 9 tools for interacting from Opencode Code CLI
- **RAG** -- local embeddings via LM Studio for doc search in worker context

## Two Ways to Run

**Locally** -- on your machine, sync through Supabase. Solo dev with an AI partner.

**On a VPS** -- AI workers grind 24/7 while you sleep. Teams and background automation.

## Quick Start

```bash
git clone git@github.com:ilyador/workstream.git
cd workstream && pnpm install && cp .env.example .env
npx supabase start && npx supabase db reset
pnpm dev
```

Opens at `http://localhost:3000`.

## Architecture

```
Browser <-> Express API <-> Supabase (Postgres)
                              ^
                          Worker polls for jobs
                              |
                          Opencode Code CLI
```

## Tech Stack

**Frontend:** React 19, Vite 8, TypeScript, CSS Modules
**Backend:** Express 5, tsx
**Database:** Supabase (Postgres, Auth, RLS, Realtime)
**AI:** Opencode Code CLI, MCP SDK
**Embeddings:** LM Studio (local, optional)

## License

MIT
