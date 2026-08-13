---
name: everlearn-reuse-first
description: Research and select existing Everlearn code, approved UI components, maintained packages, official integrations, or proven GitHub implementations before custom development. Use whenever creating a component, utility, abstraction, infrastructure capability, or adding or replacing a dependency.
---

# Everlearn Reuse First

## Search Order

1. Search the repository for equivalent behavior, not only matching names.
2. Inspect the approved library catalog and official documentation.
3. Search maintained packages and maintainer GitHub repositories.
4. Compare credible implementations for non-trivial UI, Agent, editor, workflow, queue, and integration work.
5. Choose adopt, compose, thin-adapt, or custom.

Read references/decision-record.md for the required comparison format.

## Decision Rules

- Adopt a maintained exact match with an acceptable license and project-compatible styling or runtime model.
- Compose a small number of focused capabilities when no single package covers the requirement.
- Add a thin adapter only to isolate a vendor boundary or normalize a stable cross-project contract.
- Build custom behavior only after documenting why existing options fail a confirmed requirement.
- Prefer the documented import path for the approved component system. A local wrapper must add product semantics, accessibility, state handling, or vendor isolation.
- Do not introduce a second library with overlapping responsibility. Plan replacement and deletion in the same migration sequence when switching foundations.

## Dependency Gate

Before requesting approval, record:

- exact requirement and current gap;
- project activity, release recency, license, documentation, runtime boundary, bundle or operational cost;
- compatibility with Next.js, NestJS, CSS Modules, SSR, accessibility, and current Node version as applicable;
- rejected alternatives and removal cost;
- smallest proof needed before broad adoption.

Do not install, update, or replace dependencies without explicit user approval.

## Failure Conditions

Reject work that:

- reimplements standard component behavior;
- duplicates a server or platform capability;
- creates a generic wrapper without a stable contract;
- adds a broad framework for one speculative use;
- cites popularity without checking current maintenance and official documentation.

## Delivery Evidence

Return the search locations, candidates, decision, approval status, custom code that remains, and the reason each remaining custom part cannot be delegated to an existing solution.
