---
name: everlearn-ui-design
description: Design, implement, or review Everlearn pages, layouts, components, interactions, responsive behavior, accessibility, visual hierarchy, and motion. Use for every user-facing UI change, including application shell, editor surfaces, menus, forms, cards, navigation, empty states, and visual QA.
---

# Everlearn UI Design

## Workflow

1. Read the target page specification, design-system.md, and layout-and-navigation.md when relevant.
2. Inspect the current page and search packages/ui plus the approved component library before proposing markup.
3. Produce a component reuse map: need, existing component, chosen variant, and justified gap.
4. Define information hierarchy, interaction states, responsive behavior, keyboard flow, focus behavior, and reduced-motion behavior.
5. Implement only after the specification and reuse map are consistent.
6. Verify the real rendered page at desktop and mobile widths. Exercise loading, empty, error, disabled, overflow, and long-content states that apply.
7. Capture real-browser screenshots (light, dark, and 390px mobile) into the task evidence, and run `pnpm check:design-tokens`. A UI change without screenshot evidence is not done.

Hard gates that block delivery:

- Compliance checks (states, tokens, contrast) prove the UI breaks no rule; they do not prove it looks good. Hierarchy, card affordance, empty-state structure, and spacing rhythm must be judged from the real rendering, not from code.
- No global entry point (top bar, navigation) may ship counters, badges, or links without a real data source. Dead or fake controls fail delivery.
- Colors only via semantic Tailwind utilities (`bg-canvas`, `text-ink`, `bg-accent-soft`); bare hex values, raw palette scales (`text-neutral-500`), and `dark:` color swaps are rejected. Follow everlearn-shadcn-ui for styling and component composition.
- Components come from shadcn/ui via the CLI (ADR 001); do not hand-copy registry files or keep a second overlapping component library.

Read references/delivery-checklist.md before approving a new page or a material redesign.

## Design Direction

- Treat Everlearn as a quiet personal study terminal, not a chat product or generic analytics dashboard.
- Use the paper-and-muted-bronze tokens from the project design system. Keep reading surfaces calm and reserve emphasis for location, action, and progress.
- Use one coherent icon set. Never use letters, emoji, or arbitrary glyphs as navigation icons.
- Prefer stable composition, typography, spacing, and visible state over decoration. Do not use neon AI gradients, glassmorphism, ambient particles, or permanent motion.
- Do not put every section in a card. Use Card only when content has a distinct boundary, action, or state.
- Match commercial product polish (Linear, Notion, Raycast) without leaving the study-terminal character: pixel-consistent tokens, complete interaction states, visible focus, restrained motion, and actionable copy.

## Component Rules

- Use shadcn/ui (ADR 001) as the component system; install and upgrade only through the shadcn CLI (see everlearn-shadcn-ui/references/cli.md).
- Do not hand-build Menu, MenuItem, Select, Dialog, Popover, Tooltip, Tabs, Breadcrumb, Command, SearchField, Card, Empty, Skeleton, or form controls when the library covers the behavior.
- Create a shared component only when it standardizes product semantics, accessibility, state behavior, or a composition used in at least two confirmed places.
- Keep page-specific compositions in the feature. Do not create pass-through wrappers that only rename props or attach a class.
- Every reusable navigation or action item must support an icon, label, accessible name, disabled state, and active or destructive state where relevant.

## Delivery Evidence

Return the component reuse map, state coverage, responsive notes, accessibility checks, rendered verification performed, and any intentional custom component with its justification.
