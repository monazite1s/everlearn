---
name: everlearn-requirements
description: Turn ambiguous Everlearn product requests into concise, implementation-ready specifications, acceptance criteria, traceability, and context-safe tasks. Use for new features, behavior changes, multi-page flows, unclear scope, milestone planning, and requirement reviews.
---

# Everlearn Requirements

## Workflow

1. Read the product specification and the affected page or workflow specification.
2. Separate confirmed facts, proposed decisions, assumptions, open questions, and explicit exclusions.
3. Model the complete user journey: entry, preconditions, actions, visible feedback, persistence, interruption, retry, cancellation, and exit.
4. Define entities, state transitions, permissions, API or event effects, and failure ownership without prescribing incidental implementation.
5. Write acceptance criteria that can become focused tests.
6. Split delivery into ordered, independently verifiable vertical slices with bounded context.

Read references/specification-checklist.md before declaring a requirement implementation-ready.

## Ambiguity Gate

Ask the user only when an unanswered choice changes product behavior, data ownership, security, irreversible architecture, or task sequencing. Otherwise choose the smallest reversible interpretation and record it as an assumption.

Reject specifications containing undefined terms such as support, smart, fast, enterprise-grade, or complete unless observable behavior or a measurable boundary follows.

## Task Slicing

- Give each task one user-visible or system-verifiable outcome.
- Prefer a thin end-to-end slice over separate long-lived frontend and backend mocks.
- List no more than three primary context documents.
- Keep changes within eight handwritten files unless the task explains why it cannot be split safely.
- Put architecture decisions before implementation tasks and dependency approval before installation tasks.
- Do not mix architecture discovery, multiple modules, and exhaustive tests in one task.

## Delivery Evidence

Return the confirmed scope, exclusions, assumptions, state or journey changes, acceptance criteria, traceability links, and ordered tasks. Do not pad the specification with tutorial prose or redundant examples.
