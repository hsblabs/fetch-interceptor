# Label Policy

This repository uses a small label set on purpose.

The goal is to make triage and contribution flow obvious without creating a large taxonomy that is expensive to maintain.

## Principles

- Every issue should have one `type:*` label
- Use at most one `priority:*` label per issue
- Status labels should describe the current state, not the full history
- Apply `help wanted` or `good first issue` only when an external contribution is genuinely welcome
- Remove stale status labels when the issue moves forward

## Recommended Labels

### Type

| Label | When to use it |
| --- | --- |
| `type:bug` | Something is incorrect, broken, or misleading |
| `type:enhancement` | A net-new capability or meaningful behavior improvement |
| `type:documentation` | Docs-only improvements or missing documentation |
| `type:maintenance` | Tooling, dependency, CI, or internal cleanup work |
| `type:question` | Clarification is needed before deciding whether this is work to take on |

### Priority

| Label | When to use it |
| --- | --- |
| `priority:high` | Correctness, data integrity, release-blocking, or user trust issue |
| `priority:medium` | Important but not urgent; should be addressed in normal planning |
| `priority:low` | Nice to have, opportunistic cleanup, or non-urgent improvement |

### Status

| Label | When to use it |
| --- | --- |
| `status:needs-repro` | The report is plausible but needs a reliable reproduction or failing test |
| `status:needs-decision` | The problem is understood, but the approach or product direction is unresolved |
| `status:blocked` | Work is waiting on another issue, decision, or external dependency |
| `status:in-progress` | Someone is actively working on it |
| `status:ready` | Triaged and ready for implementation |

### Contribution

| Label | When to use it |
| --- | --- |
| `help wanted` | Maintainer would accept an external PR if it follows the issue scope |
| `good first issue` | Small, bounded, low-risk task with clear acceptance criteria |

## Triage Rules

When creating or reviewing an issue, use this order:

1. Assign one `type:*` label
2. Decide whether a `priority:*` label is needed
3. Add one status label if it helps the next action
4. Add `help wanted` or `good first issue` only after the issue is well-defined

## Suggested Defaults

These defaults keep the issue tracker consistent:

- Reproducible behavior bug: `type:bug` + `priority:high` or `priority:medium`
- Docs update: `type:documentation` + `status:ready`
- Open design question: `type:enhancement` + `status:needs-decision`
- External-friendly starter task: `type:*` + `status:ready` + `good first issue`

## Notes For Maintainers

- Avoid applying both `good first issue` and `status:needs-decision`
- Avoid using `help wanted` for work that is likely to be rejected on scope grounds
- If an issue becomes ambiguous again, remove `status:ready` until the acceptance criteria are clear
- If the label set grows beyond what is easy to remember, prune it instead of adding more process
