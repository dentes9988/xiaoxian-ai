## ADDED Requirements

### Requirement: Time-aware personal memory items
The system SHALL store durable personal understanding as structured memory items rather than as raw transcript fragments. Each memory item MUST include a statement, memory type, source provenance, time window, confidence, weight, and lifecycle status.

#### Scenario: Persisting an extracted personal observation
- **WHEN** the runtime promotes a candidate memory into durable storage
- **THEN** the stored item includes the promoted statement, its type, its evidence source, the relevant time window, confidence metadata, and a status value that can be revised later

### Requirement: Evidence-ranked self-model updates
The system SHALL rank competing memory evidence using an explicit hierarchy where user confirmation outranks user self-description, repeated observed behavior, imported personal materials, external context, and optional prior-system outputs.

#### Scenario: Resolving a conflict between a prior and a confirmed preference
- **WHEN** an optional prior-system output conflicts with a user-confirmed preference
- **THEN** the confirmed preference remains the higher-authority memory used by the self-model

### Requirement: Confirmation gates for high-impact self-model changes
The system SHALL require explicit user confirmation before promoting any high-impact self-model update into high-weight durable memory.

#### Scenario: Blocking promotion of an unconfirmed high-impact update
- **WHEN** a candidate memory changes a long-term goal, value, relationship interpretation, or stable work preference
- **THEN** the candidate remains pending until the user confirms or rejects it

### Requirement: Dual self-model outputs
The system SHALL maintain both a current projection for runtime use and a life trajectory for time-aware historical understanding.

#### Scenario: Serving present-time and historical views separately
- **WHEN** the user asks how the system understands them now and how that understanding has changed over time
- **THEN** the system can present the current projection separately from the trajectory history

### Requirement: Conflict-preserving revision history
The system SHALL preserve conflicting or superseded self-model items with revision links instead of overwriting prior states without trace.

#### Scenario: Recording a changed work preference over time
- **WHEN** a newly confirmed work preference supersedes an older durable preference
- **THEN** the new item links to the superseded item and the older item remains available as historical evidence
