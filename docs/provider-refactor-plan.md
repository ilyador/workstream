# Provider Refactor Plan

## Goal

Make task-level provider selection depend on whether a concrete provider config can satisfy a flow, not on whether the provider happens to be CLI or OpenAI-compatible.

## Current Problems

- Task selection is hardcoded to `claude` and `codex`.
- `lmstudio`, `ollama`, and `custom` are treated as one generic API bucket.
- OpenAI-compatible transport leaks into capability decisions.
- Flow support is inferred from provider kind instead of explicit model capabilities.
- Task model profiles (`selected`, `balanced`, `strong`) only map cleanly for Claude and Codex.

## Target Architecture

### 1. Move capability data onto concrete provider configs

Each `provider_config` should carry explicit execution metadata for task switching:

- `default_model`
- `balanced_model`
- `strong_model`
- `selectable_models`
- `model_capabilities`

`model_capabilities` should be keyed by model id and answer at least:

- supports tools
- supported tool names
- supports images
- supports reasoning
- supported reasoning levels
- supports subagents
- context window
- supports structured output

### 2. Compile flow requirements once

Extend the flow capability pass so a flow can answer:

- does any step require tools
- does any step require image input
- does any step require flow-wide model switching
- does any resolved step require reasoning control
- does any resolved step require subagent control
- which step profiles need to be resolved (`selected`, `balanced`, `strong`)

### 3. Resolve eligibility per provider config

For each candidate provider config:

- resolve every step model through that config's profile map
- reject the config if any step model cannot be resolved
- reject the config if any resolved model lacks required flow capabilities
- show only configs that satisfy the full flow

That makes CLI, local HTTP, and remote API transport irrelevant at the task-selection layer.

### 4. Keep transport as an implementation detail

Execution drivers can stay separate:

- `claude-cli`
- `codex-cli`
- `ollama`
- `lmstudio`
- `custom`

But the task switcher should care only about the resolved capability manifest, not whether the driver happens to use CLI or OpenAI-shaped HTTP.

## Cleanup To Delete

- `supportsTaskSelectionProvider(...)`
- provider-kind capability branching for task/model/reasoning/subagents
- Claude/Codex-only profile mapping as the source of truth
- UI filtering that assumes only CLI providers are task-selectable

## Migration Strategy

1. Add provider-config execution metadata without changing behavior.
2. Introduce provider-config eligibility resolution alongside the current gate.
3. Switch task-selection UI/server logic to the new eligibility resolver.
4. Remove provider-kind gating.
5. Revisit defaults for built-in providers and add editing UX for custom capability manifests.

## Guardrails

- Do not use runtime probing as the source of truth for reasoning or subagent support.
- Keep flow snapshots concrete at queue time.
- Preserve `provider_config_id` as the execution identity.
- Treat `custom` as supported only when its config manifest is explicit enough to satisfy a flow.
