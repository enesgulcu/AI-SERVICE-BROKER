# ADR-0004: AI authority boundary

- Status: Accepted
- Date: 2026-09-23

## Context

The product needs natural language understanding and sales behavior without
allowing probabilistic output to control money, legal commitments, identity,
risk enforcement or irreversible workflow actions.

## Decision

AI returns versioned, schema-validated proposals and can request allow-listed
tools. Application/domain services authorize every tool and own persistence,
financial calculations, policy enforcement and state transitions.

Customer-visible drafts pass deterministic promise, legal-language, policy and
risk guards. Missing/stale state, invalid output or unavailable guards fail
closed. Store reason codes and model/prompt metadata, not private
chain-of-thought.

## Consequences

Prompts cannot grant authority. More deterministic services and regression
datasets are required, but model/provider replacement and incident containment
become practical.
