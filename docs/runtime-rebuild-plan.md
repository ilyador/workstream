# Runtime Rebuild Plan

## Goal

Rebuild AI execution around step executors and project-scoped Project Data, not generic provider/model plumbing.

## Core Model

- A flow step is executed by an agent runtime.
- Initial runtime families:
  - `coding`
  - `image`
- Project Data is project infrastructure, not a step executor.
- A task run may use Project Data only when:
  - the project has Project Data configured
  - the task enables it
  - the step requests it

## Data Model

### Flow steps

- Replace `model` with:
  - `runtime_kind`
  - `runtime_id`
  - `runtime_variant`
- Replace `rag` context-source behavior with:
  - `use_project_data`
- Remove `include_agents_md`
- Keep `context_sources`, but make them runtime-agnostic prompt inputs such as:
  - `agents`
  - `task_description`
  - `task_images`
  - `skills`
  - `architecture_md`
  - `review_criteria`
  - `followup_notes`
  - `git_diff`
  - `gate_feedback`
  - `previous_step`
  - `all_previous_steps`
  - `previous_artifacts`

### Tasks

- Keep `flow_id` as the execution assignment for AI tasks.
- Add `allow_project_data`.
- Keep task `effort` and `multiagent` as coding-runtime controls.
- Remove all execution fallback that depends on `task.type`.

### Projects

- Add project-level Project Data settings:
  - enabled
  - backend
  - base URL
  - embedding model
  - top-k

## Execution

- Queue-time snapshots come only from flows.
- Worker/runner execute flow snapshots only.
- Step runtime determines how the step runs.
- Project Data retrieval is injected only when:
  - step `use_project_data` is true
  - task `allow_project_data` is true
  - project Project Data is enabled

## UI

### Flow editor

- Step runtime picker
- Step runtime variant picker when the runtime defines variants
- Step-level `Use Project Data` toggle
- Runtime-agnostic context source checklist

### Task form

- AI vs human assignment stays explicit
- AI tasks must have a flow
- Task-level `Allow Project Data` toggle
- Effort and multiagent remain task-level coding controls

### Project settings

- Add `Project Data` page under the project workspace
- Manage Project Data settings there
- Reuse existing document upload/search/index infrastructure there

## Cleanup Rules

- Do not preserve provider-selection logic.
- Do not preserve OpenAI-compatibility as an execution concept.
- Do not preserve `rag`, `claude_md`, or `include_agents_md`.
- Do not preserve task-type execution fallback.

## Initial Runtime Scope

- First real executor: `Claude Code`
- Runtime abstraction must make it straightforward to add:
  - `Qwen Code`
  - `Codex`
  - `Gemini CLI`
  - image runtimes

