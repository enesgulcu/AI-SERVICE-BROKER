# ADR-0005: Requirement version storage

- Status: Accepted
- Date: 2026-09-23

## Context

Service categories have changing field sets, but requirements must remain
queryable, validated and historically reproducible. A fully generic EAV model
would weaken types, constraints and operational queries.

## Decision

Store each immutable requirement version as schema-validated JSONB plus typed
columns for stable, operationally critical fields such as service category,
location, schedule, start date and budget. Store field evidence/confidence and
special requirements in explicit related structures.

The version records the requirement-schema version. Promoting a dynamic field
to a typed column uses an additive migration and backward-compatible reader.

## Consequences

The model supports category evolution without unrestricted EAV complexity.
Schema/version migration and JSONB indexing require deliberate management.
