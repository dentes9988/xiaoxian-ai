## ADDED Requirements

### Requirement: Structured local onboarding
The system SHALL let a single local user create an initial profile using basic personal information, optional prior-system inputs, personal files, and personal web URLs.

#### Scenario: Completing first-run intake
- **WHEN** a first-time user provides profile data, enables or skips optional priors, and imports at least one personal source
- **THEN** the system creates an initial local profile that can seed the first current projection

### Requirement: Calibration-driven cold start
The system SHALL ask a short first-run calibration flow of realistic scenario questions tailored by the available intake context, and the flow MUST stay within five questions in the first session.

#### Scenario: Limiting first-run calibration scope
- **WHEN** the user completes the first-run calibration
- **THEN** the system asks no more than five scenario questions before producing the initial current projection

### Requirement: Complete daily cognition logging
The system SHALL record every interaction attempt into a daily cognition log, including raw interaction data, candidate memory outputs, system decisions, user confirmations or rejections, and resulting memory updates.

#### Scenario: Logging an interaction with an unpromoted candidate
- **WHEN** the online model emits a candidate memory that is later rejected or left unpromoted
- **THEN** the candidate and its final disposition still appear in the daily cognition log

### Requirement: Layered local retention control
The system SHALL support separate local retention behavior for raw interaction logs, candidate and decision logs, and durable memory assets.

#### Scenario: Expiring raw logs without deleting durable memory
- **WHEN** the user configures raw interaction logs to expire while keeping durable memory assets
- **THEN** the system can remove or archive the raw logs without deleting the confirmed self-model state

### Requirement: Local nightly personal-model training
The system SHALL support a local-only nightly training workflow that builds training data from cognition logs and updates a user-specific personal model checkpoint.

#### Scenario: Running scheduled local training
- **WHEN** nightly training is enabled and the rest-time window is reached
- **THEN** the system generates training data from accumulated cognition logs and runs a local checkpoint update without exporting raw user materials to a cloud training pipeline

### Requirement: Lightweight resident local personalization worker
The system SHALL support a lightweight resident local personalization worker that can keep local turn-personalization assets warm during active use and automatically sleep after 10 minutes of inactivity.

#### Scenario: Reusing the local personalization worker during active conversation
- **WHEN** the user sends several messages within an active conversation window
- **THEN** the system reuses the already-warm local personalization worker instead of cold-starting the local personalization stack for every turn

#### Scenario: Sleeping the local personalization worker after idle time
- **WHEN** no turn requires local personalization for 10 minutes
- **THEN** the system allows the resident worker to sleep and release the residency cost until it is needed again

### Requirement: No hidden durable self-model drift in resident mode
The resident local personalization worker SHALL not accumulate hidden durable self-model state outside the normal memory, confirmation, and cognition-log pipeline.

#### Scenario: Using residency without invisible profile mutation
- **WHEN** the resident worker is reused across multiple turns
- **THEN** any durable or decision-relevant self-model change still flows through the explicit memory and confirmation pipeline rather than being silently preserved only inside the resident process

### Requirement: Trained-adapter activation quality gate
The system SHALL validate a newly trained personal adapter locally before making it active, and SHALL retain the previous active adapter when validation fails.

#### Scenario: Rejecting a degenerate completed checkpoint
- **WHEN** local fine-tuning completes but the resulting adapter produces punctuation-only, empty, or insufficiently distinct personalization hints on the smoke prompt
- **THEN** the system marks that checkpoint as failed, records the reason, and leaves the previous active adapter unchanged

#### Scenario: Activating a usable completed checkpoint
- **WHEN** local fine-tuning completes and the resulting adapter produces multiple distinct usable personalization hints on the smoke prompt
- **THEN** the system activates that checkpoint and the resident worker loads it as one complete adapter on the next turn

### Requirement: Cross-platform installation documentation
The project SHALL provide explicit installation documentation for both macOS and Windows, including any platform-specific limitations for local runtime and local training paths.

#### Scenario: A Windows user checks the install docs
- **WHEN** a Windows user reads the public installation documentation
- **THEN** they can see a concrete supported setup path and any honest limits of the current Windows support without having to infer it from macOS-only instructions
