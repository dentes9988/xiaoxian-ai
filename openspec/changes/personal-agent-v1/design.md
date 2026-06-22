## Context

The approved product spec defines a local-first personal agent for ordinary users whose long-term moat is user-sovereign self-modeling. The repo currently has no implementation, so this change establishes the first architecture and requirements contract for the system.

The design must balance four tensions:

1. ordinary-user usability versus local-model complexity
2. strong online reasoning versus local privacy
3. self-modeling depth versus daily utility
4. broad vision versus a V1 scope that can actually be implemented and evaluated

The most important V1 proof point is not "the system feels insightful." It is that short-term earning help becomes more executable and more personally suitable because the system knows the user better than a generic AI does.

## Goals / Non-Goals

**Goals:**
- Define the first architecture for a single-user local web app with durable personal memory and local training.
- Separate the online runtime from the local personal-model maintenance loop.
- Encode the confirmation, evidence, and retention rules needed to keep self-model updates trustworthy.
- Focus the first task-help wedge on short-term earning assistance while preserving the broader self-modeling architecture.
- Produce implementation-ready artifacts that can drive task planning and coding.

**Non-Goals:**
- Build multi-user or hosted platform infrastructure.
- Finalize WeChat integration, decentralized governance, or full emotional-support depth.
- Solve all personal-agent domains in V1.
- Replace the strong online model with a fully local live-reasoning stack in the first implementation.

## Decisions

### Decision: Use a two-model architecture

The system will use a strong online model for live interaction and structured candidate-memory extraction, plus a local personal model for long-term organization and nightly improvement.

Why:
- The online model has the best turn-level reasoning quality.
- The local model can focus on organizing and adapting to the user over time.
- This split reduces the burden of making a small local model perform all conversational reasoning from day one.

Alternatives considered:
- Single strong cloud model with memory only: simpler, but weak on sovereignty and local evolution.
- Fully local live-reasoning model: stronger privacy, but too risky for ordinary-user quality in V1.
- Local model for first-pass extraction only: weaker than using the stronger runtime model that already sees the turn context.

### Decision: Make self-modeling the moat and earning help the wedge

V1 will keep self-modeling as the core differentiator while using short-term earning assistance as the first daily-use scenario that must be measurably better than a generic AI baseline.

Why:
- Self-modeling alone risks becoming a low-frequency introspection product.
- Earning decisions are recurring, concrete, and easy to compare against a baseline.
- This keeps the daily product behavior grounded in utility instead of novelty.

Alternatives considered:
- Growth guidance as the wedge: valuable but less immediate for daily proof.
- Emotional-expression routing as the wedge: high value, but more trust-sensitive and less directly measurable.
- Generic task help across all domains: too broad to validate cleanly in V1.

### Decision: Treat priors as optional accelerators, not authority

Optional systems such as MBTI, bazi, ziwei, and astrology will generate cold-start hints and tailored calibration prompts, but they will sit at the bottom of the evidence hierarchy.

Why:
- Priors may help first-run engagement and early questioning.
- Overweighting them would undermine trust and collapse the product into a mysticism-driven interpretation engine.
- Evidence-backed user corrections must remain authoritative.

Alternatives considered:
- No priors in V1: simpler, but weaker cold start and less aligned with the product vision.
- Priors as strong identity classifiers: unacceptable trust and product-positioning risk.

### Decision: Capture every candidate-memory extraction in daily cognition logs

The system will log all candidate-memory outputs, even when they are not promoted into durable memory.

Why:
- Nightly training needs the full chain of interpretation, correction, and acceptance or rejection.
- Auditability matters for identity-related systems.
- This creates a richer training substrate than storing final memory only.

Alternatives considered:
- Log promoted memories only: simpler, but too lossy for training and audit.
- Log raw chats only: insufficient for understanding model interpretation quality.

### Decision: Use confirmation gates for high-impact self-model changes

Identity-relevant updates that affect future reasoning must not be promoted to high-weight memory without explicit user confirmation.

Why:
- The key failure mode is persuasive mis-modeling, not just technical error.
- Users need visible control over the durable self-model.
- Confirmation creates stronger labels for nightly training and later evaluation.

Alternatives considered:
- Automatic promotion with later editing: faster, but too risky for identity and trust.
- Confirm every update: safer, but too heavy for daily use.

### Decision: Keep runtime memory consumption narrow

The live runtime will use current projection plus a small number of relevant stable items and evidence snippets, rather than injecting the entire memory archive.

Why:
- Narrow runtime context improves controllability and latency.
- Large archive injection increases noise and inconsistent behavior.
- The life trajectory remains available for explanation and review without bloating every task interaction.

Alternatives considered:
- Full archive retrieval for every task: easier conceptually, but noisy and expensive.
- Current projection only: too brittle for nuanced or contested decisions.

## Risks / Trade-offs

- [Risk] The first-run calibration may feel like a personality test instead of an assistant. → Mitigation: keep first-run calibration under five scenario questions and move utility into the first real task quickly.
- [Risk] The product may still feel more reflective than useful if earning assistance is not concrete enough. → Mitigation: evaluate against real earning tasks and require action-oriented outputs.
- [Risk] Optional priors may dominate public perception of the product. → Mitigation: keep them optional, low-authority, and primarily used to shape early questions rather than final conclusions.
- [Risk] Logging every candidate-memory extraction increases local storage and privacy sensitivity. → Mitigation: implement layered retention controls and separate raw logs from durable memory assets.
- [Risk] Nightly local training may be too heavy for ordinary-user devices. → Mitigation: schedule within user rest windows, support checkpoint rollback, and allow training to be disabled without breaking the core runtime.
- [Risk] The self-model may still overfit to temporary states. → Mitigation: require time windows, preserve superseded items, and block high-impact promotions without confirmation.

## Migration Plan

1. Create the initial repo structure for the web app and core packages described in the proposal.
2. Implement the storage schemas and persistence model for memory items, cognition logs, and checkpoint metadata.
3. Implement onboarding, import, and calibration flow in the local web app.
4. Implement the online runtime contract for user-facing replies plus structured candidate memories.
5. Implement the memory decision pipeline, confirmation flow, and current-projection builder.
6. Implement the earning-assistance task flow and baseline evaluation harness.
7. Implement the nightly training-data build, local fine-tune orchestration, and rollback-safe checkpoint update path.

Rollback strategy:
- Because this is a greenfield V1 change, rollback is primarily about checkpoint and durable-memory safety.
- Keep training checkpoints versioned and reversible.
- Treat memory promotions as append-and-link operations so prior state can be restored.

## Open Questions

- Which local storage technology should back memory items, cognition logs, and checkpoint metadata in the first implementation?
- Which structured output format and validation layer should be used for candidate-memory extraction from the online model?
- What baseline evaluation dataset shape best captures "better short-term earning help" without becoming too synthetic?
- How heavy a local fine-tuning workflow can the first ordinary-user target device realistically support?
