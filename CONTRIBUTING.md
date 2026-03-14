# Contributing

Thanks for your interest in contributing to `@hsblabs/fetch-interceptor`.

This repository is maintained in a personal organization, so the workflow is intentionally lightweight:

- Maintainers usually work on branches in the main repository
- External contributors are expected to open pull requests from forks
- Issues are used both as a public backlog and as the coordination point for non-trivial work

## Ways To Contribute

- Report a bug
- Improve tests or docs
- Propose an API or behavior change
- Submit a bug fix or small improvement

## Before You Start

For small fixes such as typo updates, test cleanups, or narrow bug fixes, opening a pull request directly is fine.

For anything that changes behavior, public API, or implementation direction, please start from an issue:

1. Open a new issue, or comment on an existing one
2. Describe the problem and proposed approach
3. Wait for maintainer feedback before spending time on larger changes

This keeps duplicate work low and helps align on scope early.

## Development Setup

This project uses `pnpm`.

```sh
pnpm install
pnpm test
pnpm test:e2e:node
pnpm test:e2e:browser
```

Before running browser E2E tests for the first time, install Playwright Chromium:

```sh
pnpm test:e2e:install
```

## Pull Request Guidelines

- Keep changes scoped to one problem
- Add or update tests when behavior changes
- Update docs when public behavior or API expectations change
- Link the related issue in the pull request description when one exists
- Explain the user-visible impact and how you verified the change

If your change is intentionally incomplete, call that out clearly in the PR description.

## Issue And PR Workflow

The expected workflow depends on who is doing the work:

- Maintainers: create a branch in the main repository and open a PR
- External contributors: fork the repository, push a branch to your fork, and open a PR back to `main`

For externally contributed PRs:

- Small, self-contained fixes can be opened without prior approval
- Larger changes should be discussed in an issue first
- Maintainers may ask to narrow the scope before review

## Review Expectations

Reviews focus on:

- Behavioral correctness
- API consistency
- Test coverage for regressions
- Clarity of docs for public-facing changes

Maintainers may choose not to merge a technically correct change if it does not fit the library's scope or API direction.

## Labels

Issue labels are used to communicate type, priority, and contribution status.

See [Label Policy](./docs/label-policy.md) for the current label set and usage rules.

## Code Of Conduct

Please keep communication direct, respectful, and technical.
