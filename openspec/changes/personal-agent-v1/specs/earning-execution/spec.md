## ADDED Requirements

### Requirement: External earning actions remain proposals until approval

The system SHALL store publishing, outreach, purchase, account-opening, and money-movement actions as local proposals and SHALL NOT treat model output as authorization.

#### Scenario: The model proposes publishing an offer

- **WHEN** a live response contains a valid `publish_offer` proposal
- **THEN** the system stores it with `pending_approval` status
- **AND** the conversation shows the proposal with explicit approve and reject controls
- **AND** no publication is performed by proposal creation alone

### Requirement: Completion requires matching external evidence

The system SHALL distinguish approval from execution and SHALL reject completion without evidence appropriate to the action kind.

#### Scenario: An approved outreach action has no receipt

- **WHEN** an outreach proposal has been approved but no outreach tool receipt exists
- **THEN** the action remains approved rather than completed

#### Scenario: An executor returns matching evidence

- **WHEN** an approved outreach action receives an `outreach_receipt`
- **THEN** the system may record the evidence and mark the action completed

### Requirement: Private credentials do not enter public action proposals

The runtime prompt SHALL prohibit API keys, passwords, bank account numbers, and other credentials in proposed actions. Local action records SHALL remain under the ignored data directory.

#### Scenario: Publishing a service offer

- **WHEN** the agent prepares a public offer proposal
- **THEN** the proposal can describe payment coordination privately
- **AND** it does not include the user's bank account or credentials

### Requirement: Projected and verified revenue remain separate

The system SHALL store projected revenue, experiment outcome metrics, and verified revenue as separate fields. It SHALL increase verified revenue only from a unique `payment_record` evidence item attached to a running or completed experiment.

#### Scenario: An experiment receives inquiries but no payment

- **WHEN** qualified inquiries or other process metrics increase
- **AND** no unique `payment_record` has been recorded
- **THEN** verified revenue remains unchanged

#### Scenario: A payment receipt is recorded

- **WHEN** a running experiment receives a unique `payment_record` with a positive amount and receipt reference
- **THEN** the system adds that amount to verified revenue
- **AND** projected revenue remains unchanged

#### Scenario: The same receipt is submitted twice

- **WHEN** a payment record repeats an existing evidence identifier or receipt reference
- **THEN** the duplicate is rejected
- **AND** verified revenue is not increased twice
