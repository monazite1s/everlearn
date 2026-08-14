---
name: everlearn-pragmatic-architecture
description: Design or review Everlearn module boundaries, dependency direction, providers, queues, workflows, and design-pattern usage while preventing speculative abstraction and premature distribution. Use for new modules, cross-module flows, infrastructure boundaries, hard-to-reverse decisions, refactors, and any introduction of a named design pattern.
---

# Everlearn Pragmatic Architecture

## Workflow

1. State the current problem, confirmed constraints, scale, failure modes, and decision deadline.
2. Search the repository and approved platform capabilities before proposing a new abstraction.
3. Propose the simplest direct design and identify the exact constraint it cannot satisfy, if any.
4. Compare at most three viable options by complexity, coupling, reliability, operability, testability, and removal cost.
5. Define module ownership, dependency direction, transaction boundary, synchronous or asynchronous boundary, and failure recovery.
6. Introduce a design pattern only when it removes a demonstrated source of change or risk.
7. Record the decision and split implementation into vertical slices.

Read references/pattern-record.md whenever a design pattern or cross-module abstraction is introduced.

## Architecture Baseline

- Keep the modular monolith: Next.js Web, NestJS API, NestJS Worker, PostgreSQL, Redis with BullMQ, and S3-compatible storage.
- Prefer module-local code over generic shared layers. Share only stable contracts or proven cross-module capabilities.
- Keep domain modules independent of provider SDKs and UI libraries.
- Keep PostgreSQL as truth; treat SSE, queues, caches, and checkpoints as delivery or execution mechanisms.
- Do not add microservices, brokers, repositories, factories, event buses, or generic workflow abstractions for hypothetical scale.
- Prefer one complete vertical slice over broad horizontal scaffolding.

## Pattern Marking

For every actual design pattern:

- Mark the primary implementation symbol with `@designPattern`; use one concise Chinese sentence for the pattern name and problem.
- Record location, problem, why direct code is insufficient, consequences, and removal trigger in the task evidence.
- Update an architecture document or ADR when the pattern affects more than one module or public contract.

Do not label ordinary dependency injection, a single interface, file organization, or framework conventions as a design pattern.

## Delivery Evidence

Return the decision, rejected options, module and dependency map, pattern records, failure recovery, deletion or simplification trigger, and the next smallest implementation slice.
