# ADR-0004: Versioned content and eval-gated AI generation

- Status: Accepted
- Date: 2026-11-24

## Context

Most content is AI-generated. A wrong answer damages trust; a prompt or model change can lower
quality without anyone noticing.

## Decision

- Every edit to a question creates a new row in `question_versions`; attempts reference the
  version shown. Batches can be rolled back.
- A golden set (~200 human-checked questions per language) gates every prompt/model change:
  100% answer accuracy and a passing explanation rubric before any batch runs.

## Consequences

More storage and a little more pipeline work; quality regressions are caught before students see
them, and history stays auditable.
