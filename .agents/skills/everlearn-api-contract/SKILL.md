---
name: everlearn-api-contract
description: Design, implement, or review Everlearn frontend-backend contracts for NestJS and Next.js, including REST resources, DTO validation, errors, pagination, optimistic concurrency, idempotency, asynchronous runs, SSE recovery, and generated clients. Use for every HTTP, SSE, or cross-layer data interaction change.
---

# Everlearn API Contract

## Workflow

1. Read api-and-events.md, the affected product flow, and the current controller or contract package.
2. Define the resource, actor, authorization boundary, request DTO, response projection, and state transition before implementation.
3. Specify success, validation, conflict, not-found, forbidden, retryable, and internal failure behavior.
4. Define pagination, filtering, sorting, version checks, and idempotency where applicable.
5. For async work, persist the run before enqueueing and define polling plus SSE behavior from the same database truth.
6. Generate or derive the frontend client and types from the server contract; then implement one vertical slice.
7. Verify DTO validation, error shape, authorization filter, concurrency behavior, and real frontend consumption.

Read references/contract-checklist.md for the required review surface.

## Contract Rules

- Use Nest DTO, class-validator, domain validation, and OpenAPI metadata for ordinary business APIs.
- Do not use Zod outside packages/agent-runtime.
- Use UUID identifiers, UTC ISO 8601 timestamps, IANA time zones for schedules, and cursor pagination for lists.
- Return errors as code, message, requestId, and optional details. Never expose stack traces, SQL, provider secrets, or raw internal errors.
- Require a version for mutable Document and Workflow resources. Report conflicts explicitly; never silently overwrite.
- Require an idempotency key for asynchronous writes and external side effects.
- Keep SSE envelopes stable and resumable by eventId or sequence; provide polling fallback.
- The frontend must not handwrite copies of server DTOs or treat Mock fixtures as a production data source.

## Delivery Evidence

Return the contract diff, state transition, generated-client impact, error matrix, concurrency and retry behavior, focused verification, and any compatibility risk.
