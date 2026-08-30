## 1. Repository and app foundation

- [x] 1.1 Create the initial local web app and package workspace structure described in the design (`apps/web`, `packages/agent-runtime`, `packages/memory-core`, `packages/ingestion`, `packages/prior-engines`, `packages/training-data`, `packages/local-model-finetune`, `packages/model-registry`)
- [x] 1.2 Add the shared project configuration needed to build, test, and lint the workspace
- [x] 1.3 Add an initial local persistence strategy for memory items, cognition logs, and model-registry metadata

## 2. Self-modeling memory core

- [x] 2.1 Define the time-aware memory item schema with type, provenance, time window, confidence, weight, status, conflict links, and impact scope
- [x] 2.2 Implement storage APIs for durable memory items, current projection, and life trajectory assets
- [x] 2.3 Implement evidence-ranking logic that prioritizes confirmation, self-description, repeated behavior, imported materials, external context, and priors in that order
- [x] 2.4 Implement high-impact confirmation gates so pending identity updates cannot be promoted into high-weight memory without explicit approval
- [x] 2.5 Implement conflict and supersession handling that preserves revision history instead of silently overwriting prior self-model state

## 3. Local intake and calibration

- [ ] 3.1 Build the onboarding flow for basic profile input and optional prior-system inputs
- [ ] 3.2 Implement personal file import with normalized provenance capture
- [ ] 3.3 Implement personal web URL import with normalized provenance capture
- [ ] 3.4 Build the first-run calibration flow with a maximum of five realistic scenario questions before the first current projection is generated
- [ ] 3.5 Generate the initial current projection from intake data and calibration answers

## 4. Runtime candidate-memory pipeline

- [x] 4.1 Define the structured output contract for live model responses and candidate-memory extraction
- [x] 4.2 Implement the online runtime path that returns a user-facing reply plus candidate-memory items for each interaction
- [x] 4.3 Implement the daily cognition log writer for raw interaction data, candidate-memory outputs, system decisions, confirmations, and resulting updates
- [ ] 4.4 Implement layered retention controls for raw logs, candidate and decision logs, and durable memory assets
- [ ] 4.5 Feed the current projection and relevant stable items into runtime task handling without loading the full memory archive
- [x] 4.6 Add a local turn-personalization step that runs before the strong online model and supplies per-turn personalization hints without directly generating the user-facing reply
- [x] 4.7 Replace per-turn cold starts with a lightweight resident personalization worker and enforce automatic sleep after 10 minutes of inactivity
- [x] 4.8 Add health-check, restart, and adapter-reload handling for the resident personalization worker

## 5. Earning-guided task help

- [x] 5.1 Implement the earning-assistance task flow for near-term income questions
- [x] 5.2 Make the earning flow prioritize short-term cash-flow improvement by default while surfacing long-term-direction tradeoffs
- [x] 5.3 Ensure earning responses include concrete next actions rather than only reflective analysis
- [x] 5.4 Build the comparison harness for personalized earning help versus a generic AI baseline
- [x] 5.5 Persist model-proposed external earning actions and expose approval or rejection inside the conversation
- [x] 5.6 Prevent external earning actions from being marked complete without prior approval and matching tool evidence
- [ ] 5.7 Connect approved earning actions to narrowly scoped channel executors with per-action tool receipts
- [ ] 5.8 Track experiment outcomes and verified revenue separately from proposed or projected revenue

## 6. Memory review and user control surfaces

- [x] 6.1 Build the "My Model" surface to display current projection and trajectory summaries separately
- [ ] 6.2 Build the memory-review surface for pending confirmations, contested memories, recent promotions, and user corrections
- [ ] 6.3 Build the data and training controls for prior-module toggles, retention settings, training schedule, export, and delete actions

## 7. Local training loop

- [x] 7.1 Implement training-data generation from daily cognition logs, confirmations, rejections, and resulting memory decisions
- [x] 7.2 Implement nightly local fine-tuning orchestration with rest-window scheduling
- [x] 7.3 Implement checkpoint registration, activation, and rollback in the model registry
- [x] 7.4 Ensure the local training flow can be disabled without breaking the live assistant runtime
- [x] 7.5 Define how newly trained adapters become visible to the resident personalization worker without mixing old and new loaded state
- [x] 7.6 Gate automatic adapter activation on a local smoke evaluation and preserve the previous active adapter when validation fails

## 8. Safety and evaluation

- [ ] 8.1 Add schema and storage tests for memory items, projections, trajectories, and log retention layers
- [ ] 8.2 Add safety tests for confirmation gates, evidence ordering, and conflict preservation
- [ ] 8.3 Add pipeline tests that cover intake -> candidate-memory extraction -> confirmation -> durable self-model updates
- [x] 8.4 Add evaluation scenarios for short-term earning help and compare personalized output against a generic baseline on executability and personal fit

## 9. Platform and documentation support

- [x] 9.1 Add Windows installation and setup instructions with explicit notes about supported runtime and local-training depth
- [x] 9.2 Update the public README so macOS and Windows setup paths are both visible and copyable
- [x] 9.3 Update the public project page so cross-platform support and local privacy architecture are described consistently
