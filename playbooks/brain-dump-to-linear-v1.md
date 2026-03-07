# Brain Dump to Linear v1

Use this flow when you have a rough product vision and need an executable, sequenced set of Linear tickets.

## Goal

Turn one high-level idea into:
- one pilot epic
- 3 to 8 sequenced stories
- clear dependencies
- explicit open questions
- agent assignments per stage

## Operating Model

- Linear is the system of record for all ticket state.
- `haydninfra` stores reusable process docs, templates, and prompts.
- Product code changes happen only in the product repo (for this pilot: website repo).

## Status Pipeline

Use the same status map for every story:

`Backlog -> Ready -> In Progress -> In Review -> Ready to Ship -> Shipped`

No story skips statuses.

## Roles

- **Orchestrator Agent:** intake, decomposition, sequencing, assignment.
- **Spec Agent:** converts story intent into testable acceptance criteria and edge cases.
- **Build Agent:** implementation planning and coding execution.
- **QA Agent:** test matrix, pass/fail against acceptance criteria, regression checks.
- **Release Agent:** release packet, rollback note, post-ship checks.

## Intake Flow (Step-by-Step)

### Step 1: Vision Dump

Paste your idea into a working doc using this structure:

```md
## What we are trying to accomplish

## Who this is for

## Why this matters for business

## Must-have outcomes

## Nice-to-have outcomes

## Constraints (time, design, tech, dependencies)

## Reuse opportunities from product repo

## Unknowns / questions
```

### Step 2: Orchestrator Decomposition

Send the vision dump to your Orchestrator Agent with this prompt:

```md
You are my Orchestrator Agent.

Input: raw vision notes for a pre-launch landing-page effort.
Objective: produce execution-ready Linear artifacts.

Return exactly:
1) Proposed epic name + goal statement
2) Workstream breakdown (design shell, sections, data spoofing, polish, analytics, QA)
3) Sequenced story list with dependencies
4) Story sizing (S/M/L) and risk tags
5) Open questions requiring human decisions
6) Suggested parallelization opportunities
7) Recommended first story to start this week

Constraints:
- Prefer smallest shippable slices
- Separate "design alignment" from "component implementation"
- Include a safe plan for reusing product components without product dependencies
```

### Step 3: Human Decision Gate

Before creating stories, answer the open questions and lock:

- visual direction (approved reference or wireframe style)
- demo scope (what the landing-page demo does and does not do)
- data spoofing rules
- reuse boundaries (what can be copied/adapted vs rebuilt)

### Step 4: Epic + Story Creation in Linear

Create one pilot epic and stories using templates:

- `templates/linear-epic-template.md`
- `templates/linear-story-template.md`

### Step 5: Story-Level Spec Pass

For each story moved to `Ready`, run Spec Agent and post output as a Linear comment.

If acceptance criteria are not testable, keep story in `Ready` and revise.

### Step 6: Build + QA Parallel Start

When story moves to `In Progress`:

- Build Agent starts implementation
- QA Agent drafts test matrix in parallel from acceptance criteria

QA execution completes only after build output is ready.

### Step 7: Ship Gate

Story can move to `Ready to Ship` only when:

- all acceptance criteria pass
- telemetry is implemented and verified
- release packet and rollback note are posted

## Reuse Product Components Safely

When lifting product UI into landing-page demo:

1. Create a thin adapter layer in website repo.
2. Replace live data with deterministic mock fixtures.
3. Remove auth/network assumptions from demo path.
4. Keep demo interactions realistic but bounded.
5. Document "parity gaps" between real product and demo.

## Weekly Ceremony (30 Minutes)

Run once per week and log in `metrics/week1-landing-page-pilot.md`:

- cycle time per story
- number of reopened stories
- escaped defects
- percent stories with complete artifact chain

## Definition of Success for v1

At least one story reaches `Shipped` with all artifacts:
- spec brief
- build report
- QA report
- release packet
- telemetry verification note
