# Personal Agent V1 Design

Date: 2026-06-21
Status: Draft for review

## Summary

98Agent V1 is a local-first personal agent whose moat is not generic automation but user-sovereign self-modeling. It should become useful because it gradually understands one concrete person better than a generic AI does, while keeping that understanding inspectable, correctable, and private.

V1 should prove one loop:

1. the system forms a useful model of the user
2. the user can inspect and correct that model
3. that model improves daily advice and decisions

The first practical wedge remains short-term earning help, but the product must feel like a daily companion, not only a task form.

## Product Position

V1 is:

- a local-first web app
- a self-modeling personal agent
- a daily-use decision and task companion

V1 is not:

- a fortune-telling product
- a fixed identity classifier
- a generic chatbot with a long context window
- a centralized personality platform

## Core Principles

1. User sovereignty over identity
   The system helps the user see themselves more clearly. It never owns the definition of who the user is.

2. Time-aware self-modeling
   The system stores observations with time, confidence, provenance, and revision history. People are modeled as evolving trajectories, not frozen labels.

3. Priors are cold-start hypotheses, not truth
   MBTI, bazi, ziwei, astrology, yijing, and similar systems may help generate early hypotheses about temperament, motivation, and tension patterns. They must never be presented as fate, prediction, destiny, or authoritative identity.

4. Important self-model changes require confirmation
   Any update that could materially affect later decisions, task execution, or self-understanding must be confirmed before promotion into high-weight memory.

5. Guidance should focus on consequences
   The product should help the user compare how choices affect their life, not define what type of person they are and then choose on their behalf.

6. Privacy is a feature, not only an implementation detail
   Raw personal material, memory assets, training sets, and local personal-model fine-tuning stay local by default.

7. Presence matters
   The agent should feel like an ongoing companion with visible state, not only a text box.

## V1 Success Definition

V1 succeeds if a non-technical user can:

1. install a local web app
2. enter basic profile data and optional prior inputs
3. import personal files and personal URLs
4. chat with the agent about real life and real work
5. inspect how the agent currently understands them
6. correct important misunderstandings
7. receive more personally suitable short-term earning advice than from a generic AI
8. allow local nightly self-model training without sending personal training data to a cloud trainer

## Product Wedge

### Long-term moat

The moat is self-modeling ability that is:

- accurate enough to be useful
- transparent enough to be trusted
- revisable enough to stay aligned
- grounded enough to help with decisions

### Daily-use wedge

The first daily-use wedge is short-term earning help:

- what can I do this week to make money
- what should I sell first
- what opportunity fits my current energy and constraints
- what should I avoid because it looks good in theory but does not fit me

Secondary scenarios stay in scope:

1. growth guidance
2. emotional-expression routing

## Priors: Reframed Design

### Why priors exist

Prior systems exist only to make the first few conversations more informed. They help the system ask better calibration questions earlier.

### What priors are allowed to do

- suggest possible personality tendencies
- suggest possible motivational tensions
- suggest possible decision-style patterns
- suggest useful follow-up questions
- provide low-confidence seeds for later confirmation

### What priors are not allowed to do

- predict fate, luck, romance, wealth, or life outcomes
- tell the user who they "really are"
- override long-term observed behavior
- produce advice in mystical language
- change the self-model silently

### Required translation layer

All prior systems must be translated into a shared, grounded output format oriented around personality understanding.

Each prior output should contain:

1. `summary`
   One short paragraph framed as tentative personality hypotheses.

2. `structuredSignals`
   Three to five short, low-authority behavioral signals.

3. `suggestedQuestions`
   Two to four realistic questions aimed at confirming or rejecting the hypothesis through lived experience.

4. `disclaimers`
   Explicit reminder that priors are low-authority and must yield to observed behavior and user confirmation.

### Language rules for prior outputs

Allowed language:

- decision style
- response to pressure
- relationship style
- motivation and avoidance
- energy and recovery
- structure versus freedom
- risk appetite versus stability needs

Disallowed language:

- destiny
- fortune
- fate
- life prediction
- "your chart says you will"
- "this period guarantees"
- any recommendation that assumes the prior is true

## Seven Desire Directions Lens

The V1 UI should expose a lightweight seven-direction self-understanding layer. This is not a moral scorecard and not a diagnosis. It is a human-readable lens for where the user's drives may currently be expressing in healthy, balanced, or distorted ways.

Each direction has:

- a desire type
- positive-development names
- a balance-state description
- a shadow label when distorted

| Desire Type | Positive Development | Balance State | Shadow Drift |
| --- | --- | --- | --- |
| Self-worth desire | dignity, confidence, responsibility | knows their own value while also recognizing the value of others | arrogance |
| Security desire | accumulation, protection, stewardship | can hold resources without being ruled by resource anxiety | greed |
| Intimacy desire | love, closeness, vitality | wants to nourish relationship, not consume it | lust |
| Comparison desire | initiative, admiration, learning | can see differences without negating self or others | envy |
| Enjoyment desire | nourishment, enjoyment, abundance | can enjoy and also stop | excess |
| Justice desire | justice, courage, protection | can express anger without being controlled by it | rage |
| Rest desire | calm, recovery, depth | can rest without abandoning responsibility | inertia |

### UI behavior for the seven directions

1. show the seven directions above the mascot
2. use a centered scale to distinguish:
   - positive development
   - balanced center
   - shadow drift
3. place an info icon next to the positive-development label
4. the tooltip must explain all three layers:
   - what healthy expression looks like
   - what balanced expression looks like
   - what distorted expression looks like
5. all values must be labeled as current hypotheses, not truth
6. maintain two layers of desire scoring:
   - an immediate display layer that may shift lightly each turn
   - a stable baseline layer that updates every 10 effective user turns
7. an effective user turn should mean a turn with meaningful self-expression, preference, conflict, decision style, or goal signal, not simple greetings or tiny factual replies
8. important explicit confirmations may update the stable baseline earlier than the 10-turn threshold

## UX Direction

### Overall interaction model

The UI should take inspiration from OpenHuman's companion feel:

- a visible AI character on the left
- a working chat and control surface on the right
- an experience that feels present, not purely panel-driven

But 98Agent's V1 focus is different:

- stronger emphasis on self-model inspection
- explicit confirmation gates
- visible desire-direction hypotheses
- earning-first task support

### Primary layout

Left side:

- seven-direction desire panel
- AI mascot
- current emotional state
- top-level self-model summary
- pending confirmation count

Right side:

- profile intake and prior generation
- training controls
- chat workspace
- current self-model facets
- prior outputs and follow-up questions

### Mascot states

The mascot should visibly change state based on what the system is doing.

Required states:

- idle
- listening
- thinking
- delighted
- concerned
- dreaming

Optional later states:

- speaking
- surprised
- reflective

### Why the mascot matters

The mascot is not decorative. It gives the user one-frame visibility into whether the agent is:

- available
- paying attention
- uncertain
- actively reasoning
- consolidating memory in the background

## First-Run Experience

Recommended first-run sequence:

1. basic profile intake
2. optional prior inputs
3. optional personal file and URL import
4. three to five realistic calibration questions tailored by prior hypotheses
5. initial current projection
6. first earning-oriented task interaction

The first-run questions should feel like:

- grounded real scenarios
- slightly challenging but relatable
- a way to help the agent understand the user

They should not feel like:

- a personality quiz
- a spiritual reading
- a diagnosis form

## System Architecture

### Main modules

- `apps/web`
  Local web app for onboarding, chat, review, and training controls.

- `packages/agent-runtime`
  Live conversation runtime using stronger cloud reasoning when needed.

- `packages/memory-core`
  Time-aware memory schema, evidence weighting, projection building, and confirmation gates.

- `packages/ingestion`
  Personal file and URL import with provenance.

- `packages/prior-engines`
  Prior adapters and translation layer into grounded personality hypotheses.

- `packages/training-data`
  Builds local fine-tuning corpora from profile seeds, prior outputs, confirmations, corrections, and daily cognition logs.

- `packages/local-model-finetune`
  Local LoRA fine-tuning orchestration, training windows, checkpoint creation, and rollback.

- `packages/model-registry`
  Tracks active base model and personal checkpoints.

## Runtime Split

### Strong online model

Used during live chat.

Responsibilities:

- understand the current user request
- answer well in the moment
- extract candidate memories from every turn
- produce higher-quality structured responses

### Local personal model

Used for long-term organization and nightly improvement.

Responsibilities:

- consolidate extracted daily signals
- detect repetition and conflict
- prepare confirmations
- update current projection
- fine-tune on the day's private cognition set

## Memory Model

The core memory unit is a time-aware memory item with evidence.

Each item should capture:

- type
- subject
- statement
- evidence
- source
- time window
- confidence
- weight
- status
- confirmation requirement
- conflicts
- supersession links
- impact scope

Memory layers:

1. raw interaction layer
2. candidate memory layer
3. confirmed stable memory layer
4. current projection layer
5. life trajectory layer

The runtime should usually consume:

- current projection
- a few relevant stable memories
- only the evidence snippets needed for the current task

## Confirmation Policy

The product must require confirmation for:

- changes to important preferences
- changes to major goals
- changes to sensitive relationship interpretations
- changes to stable personality framing that may affect future advice

Low-risk items may be stored as tentative without blocking.

High-risk identity items must remain pending until confirmed.

## Training Loop

### What gets trained locally

The local model should train on:

- profile seed interpretation
- prior-skill reconciliation examples
- candidate-memory extraction history
- confirmation and rejection outcomes
- updated current projections
- daily cognition logs

### What must stay isolated

- user-specific fine-tunes must never pollute the base model
- the system should use adapter-based isolation by default
- every run must produce auditable datasets and checkpoints

### Scheduling

Nightly or rest-window training should:

- respect user-configured local hours
- be fast enough for regular use
- skip cleanly outside the window
- support rollback to a previous checkpoint

## V1 Evaluation

The most important evaluation scenario is short-term earning help.

We should compare:

1. a generic AI answer
2. a self-model-aware 98Agent answer

The personalized answer should score better on:

- executability
- fit to the user's actual temperament
- fit to current constraints
- awareness of tradeoffs the user really cares about

## Sources To Track

The project should keep a running record of referenced skills, repos, and design inspirations for future open-source documentation and paper writing.

Current tracked references include:

- `dzcmemory-web/bazi-ziwei-skill`
- `astrologyai-pro/astrology-skill`
- `jinchenma94/bazi-skill`
- `yijingai-team/yijing-skill`
- `Brhiza/mingyu`
- `karpathy/autoresearch`
- `tinyhumansai/openhuman`

## Self-Check

### Strong

- The product is now clearly framed as self-modeling, not fortune telling.
- Priors have an explicit translation layer and hard language constraints.
- The seven-direction lens is now interpretable and usable in UI.
- The mascot is justified as part of the experience, not decoration.
- Confirmation rules remain central.
- Local training remains a first-class part of the system.

### Still needs follow-through in implementation

- Prior outputs must be regenerated with the new grounded framing.
- The onboarding flow still needs realistic first-run scenario questions.
- File and URL import are still incomplete in the current prototype.
- The UI should render self-model and pending confirmations in a human-readable way instead of raw JSON.
- The seven-direction scores must remain visibly provisional and evidence-backed.

### Review questions

1. Is the seven-direction naming exactly the vocabulary you want in V1, or should any labels be softened?
2. Should the left-side companion panel show only the current hypothesis, or also a small recent-change trend?
3. Do you want the first calibration questions to be more earning-first, or more general-personality-first?
