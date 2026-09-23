# ADR-0012: Active requirement schema catalogue

- Status: Accepted
- Date: 2026-09-23
- Owners: Engineering

## Context

Service categories are configuration, not a closed code enum. OD-001 is still
open, and its safe default is to build schemas dynamically while activating
only `REGULAR_HOME_HELPER`. Field names were previously fixed inside the
assessment function.

## Options considered

- Keep the home-helper fields hard-coded until the catalogue decision closes.
  That delays the configuration boundary the domain model already requires.
- Register every baseline category now, including childcare. That would treat
  unapproved schemas, prices, and risk policies as active.
- Keep one versioned catalogue, mark only the approved schema active, and
  reject every other schema version.

## Decision

Requirement fields and special-requirement codes live in a catalogue. The
assessment function validates against the selected active schema. The only
active entry is `REGULAR_HOME_HELPER` / `regular-home-helper-v1`. An unknown
or inactive schema version is `INVALID_REQUIREMENT`. Human confirmation rules
are unchanged: model output below confidence 1 is evidence, and free text is
not a fact.

## Consequences

A later category is a catalogue entry plus its own approved price and risk
policy. It does not require a new assessment engine. Activating a second
schema still needs OD-001 and the related commercial and safety decisions.

## Validation and rollback

Unit tests cover the single active category and rejection of an unknown
schema version. Rollback is reverting the catalogue module; stored
`regular-home-helper-v1` versions stay valid.
