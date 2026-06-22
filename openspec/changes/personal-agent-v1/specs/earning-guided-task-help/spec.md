## ADDED Requirements

### Requirement: Personalized short-term earning assistance
The system SHALL use the user's current projection and relevant durable memory when answering short-term earning questions.

#### Scenario: Tailoring advice to the user's actual constraints
- **WHEN** the user asks what they should do this week to make money
- **THEN** the system grounds its answer in the user's known constraints, strengths, willingness, energy, and current circumstances instead of giving only generic earning advice

### Requirement: Cash-flow-first default for earning decisions
The system SHALL prioritize near-term cash-flow improvement as the default optimization target in the earning-assistance scenario.

#### Scenario: Choosing between faster monetization and abstract positioning
- **WHEN** one option is more likely to improve near-term cash flow and another is more elegant but slower to monetize
- **THEN** the system recommends the cash-flow-improving option as the default path

### Requirement: Explicit long-term tradeoff disclosure
The system SHALL surface the tension between near-term cash-flow choices and long-term direction whenever those goals diverge.

#### Scenario: Revealing tension between money pressure and long-term direction
- **WHEN** the recommended near-term earning path weakens the user's longer-term direction
- **THEN** the system explicitly describes that tradeoff alongside the recommendation

### Requirement: Action-oriented output for earning tasks
The system SHALL provide executable next steps rather than only high-level analysis in the earning-assistance scenario.

#### Scenario: Ending with concrete next actions
- **WHEN** the system recommends a short-term earning path
- **THEN** the response includes concrete next actions the user can take immediately

### Requirement: Generic-AI comparison benchmark
The earning-assistance capability SHALL be evaluable against a generic assistant baseline using the same user scenario.

#### Scenario: Measuring personalized earning value
- **WHEN** the team runs evaluation scenarios for short-term earning help
- **THEN** the personalized system can be compared against a generic AI response on executability and personal fit
