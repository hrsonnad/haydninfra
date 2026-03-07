# Linear Command Center v1

Run this checklist top-to-bottom for each new initiative.

## 0) Inputs

- Vision notes
- Constraints (timeline, dependencies, quality bar)
- Target repository for implementation

## 1) Intake and Decomposition

1. Paste vision notes.
2. Run prompt: `templates/agent-prompts/orchestrator-agent.md`.
3. Resolve all open questions.
4. Create one epic + sequenced stories in Linear.

## 2) Ready Gate

Before moving story to `Ready`:

- apply `templates/linear-story-template.md`
- ensure DoR checklist is complete
- run `templates/agent-prompts/spec-agent.md`

## 3) Build Gate

When moving story to `In Progress`:

- run `templates/agent-prompts/build-agent.md`
- in parallel, QA drafts matrix using `templates/agent-prompts/qa-agent.md`
- post output comments to story

## 4) Review Gate

When moving story to `In Review`:

- QA executes full validation
- pass/fail each acceptance criterion
- verify telemetry

## 5) Ship Gate

Before `Ready to Ship`:

- all criteria pass
- tests complete
- telemetry verified
- run `templates/agent-prompts/release-agent.md`

## 6) Status and Monitoring

Use `templates/linear-status-comment-template.md` for each active story:
- stage
- agent status
- open questions
- blockers
- next action

## 7) Weekly Retrospective

Update `metrics/week1-landing-page-pilot.md`:
- cycle time
- reopened stories
- escaped defects
- artifact chain completion rate
