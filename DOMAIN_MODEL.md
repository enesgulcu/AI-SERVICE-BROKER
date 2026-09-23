# Domain Model

Status: Initial V1 model

## Bounded contexts and aggregate roots

### Acquisition

- **Lead**: source, source reference, raw payload reference, normalized facts,
  analysis and acquisition attribution.
- Invariants: `(source, sourceReference)` is unique; raw data is evidence, not
  operational truth; contact eligibility must be evaluated before outreach.

### Customer

- **Customer**: identity, contact points, preferences, communication/consent
  state and profile references.
- A phone number is a contact identifier, not proof of identity.

### Conversation

- **Conversation**: channel, participant, workflow state reference, control mode
  and message sequence.
- **Message**: immutable inbound/outbound content, provider ID, status and
  provenance.
- One active processor may produce a reply for a conversation at a time.

### Requirement

- **Requirement**: service type and current version pointer.
- **RequirementVersion**: immutable structured snapshot.
- **RequirementFieldEvidence**: value, confidence, source message and extractor.
- **WorkerPreference** and **SpecialRequirement** remain explicit structures.
- Material changes create versions; uncertainty is never converted to fact.

### Policy and company facts

- **PolicyDefinition/PolicyVersion**: typed, effective-dated, approved rules.
- **CompanyFact/CompanyFactVersion**: approved factual claims and evidence.
- Published versions are immutable; decisions store the exact version used.

### Risk

- **RiskCase**: accumulated signals and current disposition.
- **RiskSignal**: typed evidence with severity, confidence and source.
- **Anomaly**: unusual input classification independent of guilt or intent.
- Scores aid decisions; deterministic policy produces the action.

### Commercial

- **PricingCalculation**: immutable inputs, rule versions and outputs.
- **NegotiationSession**: budget, objections, concession history and remaining
  authority.
- **Quote/QuoteVersion**: immutable priced scope, validity and policy references.
- AI cannot create values outside a valid pricing calculation.

### Workflow and review

- **WorkflowInstance**: current state, version and transition history.
- **HumanReview**: reason, priority, evidence, recommendation and resolution.
- **AutomationControl**: global/module/conversation-level operational override.

### Fulfilment

- **Job**: accepted requirement and quote snapshots.
- `JOB_READY` requires customer acceptance, valid snapshots and passed policy
  gates; it does not imply worker availability.

### Audit

- **AuditEntry**: append-only actor/action/entity/value references.
- **DomainEvent**: immutable business occurrence for projections/integrations.
- **AIDecision**: model/prompt/schema versions, reason codes and confidence;
  private chain-of-thought is never stored.

## Shared value objects

`EntityId`, `Money(currency, minorUnits)`, `PhoneNumber`, `LocalDate`,
`TimeRange`, `Location`, `Confidence`, `RiskLevel`, `ReasonCode`,
`PolicyReference`, `CorrelationId`, `IdempotencyKey`.

Money uses integer minor units and an explicit currency. Time intervals and
effective dates have explicit timezone semantics.

## Ownership rules

- Only the owning module writes an aggregate.
- Database foreign keys may protect integrity but do not grant write access.
- Cross-module references use IDs and immutable snapshots where historical
  meaning must survive later edits.
- Events describe completed facts in past tense.
- Analytics reads projections and never mutates operational aggregates.

## Initial service categories

Service categories and required fields are configuration/policy data, not a
closed code enum. The baseline category is `REGULAR_HOME_HELPER`; activating
childcare, elderly care, live-in or other categories requires approved schemas,
pricing and risk policies.

## Deferred worker domain

Worker, availability, matching, reservation, offer, payment and contract
aggregates are future bounded contexts. V1 can define narrow supply-check and
matching ports but must not create fictional availability or commitment.
