---
title: Preserve observational interception across all failure paths
status: accepted
date: 2026-08-01T02:37:54+09:00
agent: GPT-5 Codex
---

# Preserve observational interception across all failure paths

## Context

The interceptor promises that matcher and callback failures do not change the original network result. The same invariant must also cover request and response normalization, callback response cloning, startup, and shutdown.

The existing implementation has two independent handler paths used by production and tests. It also exposes resolved runtime options from the package entrypoint and permits transport/reason error combinations that the implementation cannot produce.

## Decision

- Only a rejection from the underlying `fetch` or an XHR terminal failure event is reported through `onError`.
- Matcher, callback, cloning, and normalization failures are reported to `console.error` and never replace the original network result.
- XHR statuses 204, 205, and 304 produce a `Response` with a null body. XHR status 0 is represented by `Response.error()`, the standard `Response` value that can carry status 0.
- Installing the fetch and XHR adapters is transactional. A failed installation restores every adapter already installed and leaves the interceptor stopped.
- `FetchInterceptorError` is a discriminated union keyed by `transport`, so fetch cannot report the XHR-only `timeout` reason.
- Tests exercise callback and lifecycle behavior through `createFetchInterceptor`. Pure request/response normalization remains an internal seam with focused tests.
- Only consumer-facing types are exported from the package entrypoint. Resolved runtime options remain internal.

## Consequences

- The original fetch/XHR outcome remains authoritative even when observation cannot be completed.
- XHR status 0 cannot retain response body or headers because the standard `Response` interface has no constructible successful status-0 representation.
- The direct-handler testing decision in `docs/plans/2026-03-12-matcher-default-internals-design.md` is superseded. Normalization helpers remain directly testable, while transport behavior is tested through the public interface.
- Public declaration comments must be preserved so consumers can see lifecycle and failure contracts in editor tooling.
