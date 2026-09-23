# ADR-0003: Versioned policy and configuration

- Status: Accepted
- Date: 2026-09-23

## Context

Pricing, risk, service schemas, communication rules, company facts and prompts
will change. Historical decisions must remain explainable and reproducible.

## Decision

Use typed, schema-validated configuration with draft, approved, active and
retired lifecycle states. Published versions are immutable and effective-dated.
Material decisions store the exact policy/config/prompt versions used.

Do not execute arbitrary uploaded code or build a general-purpose runtime rule
language in V1. Domain services interpret only explicitly supported rule types.

## Consequences

Configuration changes require validation, approval, audit and rollback. New
rule shapes require code and tests, trading unrestricted dynamism for safety,
predictability and migration control.
