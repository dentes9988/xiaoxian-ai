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
