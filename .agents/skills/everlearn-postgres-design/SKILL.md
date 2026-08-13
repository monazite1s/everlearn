---
name: everlearn-postgres-design
description: Design, migrate, query, or review Everlearn PostgreSQL schemas with explicit ownership, constraints, indexes, lifecycle rules, concurrency, and Kysely integration. Use for every table, column, relation, constraint, index, migration, query shape, retention rule, or database performance change.
---

# Everlearn PostgreSQL Design

## Workflow

1. Read data-model.md, the owning module, and the queries or state transitions the change must support.
2. Define ownership, identity, lifecycle, nullability, cardinality, and deletion behavior before writing DDL.
3. Encode stable invariants with PostgreSQL primary keys, foreign keys, unique constraints, check constraints, and transactions.
4. Design indexes from concrete filter, join, order, and cursor patterns; verify index column order.
5. Write a forward migration and a safe local rollback or explicit irreversible rationale.
6. Regenerate database types from the applied schema. Do not manually duplicate table definitions.
7. Verify against real PostgreSQL with constraint, transaction, and representative-query tests.

Read references/schema-review.md before approving a schema change.

## Everlearn Invariants

- Every owned business object carries ownerId even while the first release uses a fixed local user.
- Use UUID identifiers and timestamptz. Store schedule zones as IANA names.
- PostgreSQL is the business truth; Redis state must be reconstructible.
- Preserve stable document blockId values and explicit revision relationships.
- Represent bounded state with named database or contract states, not free text.
- Prefer normalized columns for identity, ownership, status, joins, filters, ordering, uniqueness, and lifecycle. Use JSON only for genuinely variable payloads with an owner and validation boundary.
- Do not cascade-delete user content unless the product lifecycle explicitly requires it.

## Failure Conditions

Reject schema work with application-only invariants, ownerless queries, speculative indexes, handwritten database types, string-concatenated SQL, ambiguous nullability, or migrations that assume an empty database.

## Delivery Evidence

Return the data-model change, invariants and their enforcement layer, query-to-index map, migration and rollback behavior, generated-type result, real PostgreSQL verification, and remaining operational risk.
