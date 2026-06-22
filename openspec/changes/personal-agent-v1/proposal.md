## Why

Generic AI assistants can help with tasks, but they do not build a durable, user-sovereign understanding of a specific person. This project needs a local-first personal agent that can form a time-aware self-model, let the user inspect and correct it, and use that understanding to improve daily task help.

The first implementation should focus the broad vision into one proof point: self-modeling should make short-term earning assistance meaningfully more executable and more personally suitable than advice from a generic AI.

## What Changes

- Add a local-first single-user personal agent product model with a browser-based local app, explicit privacy boundaries, and local nightly training.
- Add a self-modeling memory system that records time-aware memory items, evidence hierarchy, confirmation state, and durable current-projection and life-trajectory assets.
- Add support for structured onboarding with basic profile data, optional prior systems, personal file import, personal URL import, and a short calibration flow.
- Add a runtime contract where the strong online model returns both user-facing responses and structured candidate memory items for every interaction.
- Add a daily cognition-log and local personal-model training loop that captures candidate-memory extraction, user confirmations, memory decisions, and training-data generation.
- Add a task-help capability focused on short-term earning assistance, with explicit handling of tension between immediate cash flow and long-term direction.

## Capabilities

### New Capabilities
- `personal-self-modeling`: Build and maintain a time-aware, correctable personal memory model with evidence hierarchy, conflict handling, and confirmation gates.
- `local-intake-and-training`: Onboard a user with profile data, optional priors, imported files and URLs, and maintain local daily cognition logs plus nightly personal-model training.
- `earning-guided-task-help`: Use the personal model during daily task assistance, with short-term earning help as the primary V1 scenario and explicit surfacing of long-term tradeoffs.

### Modified Capabilities

None.

## Impact

- Affects the initial product architecture under `apps/web` and `packages/*` modules described in the design spec.
- Introduces local storage, ingestion, memory, and model-management responsibilities that will shape the full repo structure.
- Requires an explicit structured-output contract from the online model and a local fine-tuning pipeline for the personal model.
- Creates the baseline OpenSpec contract for future implementation and later extensions such as growth guidance, emotional-expression routing, and external channels.
