# ADR-0002: The client is untrusted – answers, entitlement and scores live on the server

- Status: Accepted
- Date: 2026-11-24

## Context

The question bank is the core asset; challenges and leagues invite cheating; free limits and
Premium must not be bypassable by a modified app.

## Decision

- Correct answers and explanations live in `question_keys`, which students cannot read.
  `submit_answer` records the attempt first and only then returns correctness and explanation.
- Free/Premium and daily limits are checked inside server functions.
- Challenge timers and scores are computed from server timestamps.

## Consequences

Slightly more server round-trips; offline answering queues attempts and reveals answers on sync
(downloaded offline sets carry encrypted keys only if a later ADR approves it).
