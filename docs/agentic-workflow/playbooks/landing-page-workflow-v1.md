# Landing Page Workflow v1 (Pilot)

This is the lightweight, fast-start workflow for finishing the landing page while showcasing agentic delivery.

## Scope of This Pilot

- Focus on landing page delivery only.
- Use one pilot epic with 2 to 4 stories.
- Optimize for speed, traceability, and reliability.

## Recommended Story Sequence

1. **Page shell and design system alignment**
2. **Hero + primary CTA and value framing**
3. **Interactive product demo section (spoofed data, no auth)**
4. **Instrumentation, QA pass, and polish**

The key decision is to align on shell first, then fill sections. This reduces rework.

## Workstream Split

- **Track A (Design):** shell, spacing, typography, section hierarchy.
- **Track B (Demo):** reusable product-like components adapted for static/demo mode.
- **Track C (Quality):** telemetry, QA matrix, cross-browser checks, release notes.

Tracks A and B can run in parallel after shell direction is approved.

## Demo Reuse Pattern

For any product component used on the landing page:

- Copy or adapt presentation logic only.
- Replace external dependencies with local mocks.
- Keep deterministic fixtures in website repo.
- Disable sign-up or real data mutation flows.
- Add visible "Demo data" affordances when needed.

## Agent Hand-off Rules

- Orchestrator owns decomposition and dependency ordering.
- Spec Agent must produce testable acceptance criteria.
- Build Agent must provide files touched, commands run, and manual QA steps.
- QA Agent must produce criterion-by-criterion pass/fail.
- Release Agent must include rollback and post-ship checks.

If any output is incomplete, story does not advance.

## Daily Cadence (15 Minutes)

1. Review all stories in `Ready` and `In Progress`.
2. Resolve open questions blocking Spec or Build.
3. Confirm one story target for same-day progression.
4. Close loop on missing artifacts.

## Artifact Checklist Per Story

- Story description filled (DoR)
- Spec comment
- Build report comment
- QA report comment
- Release packet comment

## Known Risks for This Pilot

- Scope creep from visual experimentation
- Hidden dependency on product repo internals
- QA skipped due to speed pressure

Mitigation:
- keep stories small
- lock design direction early
- enforce required comments before status changes
