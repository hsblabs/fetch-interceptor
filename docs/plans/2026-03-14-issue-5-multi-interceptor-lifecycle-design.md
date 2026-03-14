# Issue 5 Design: Concurrent Interceptor Lifecycle

## Summary

Issue [#5](https://github.com/hsblabs/fetch-interceptor/issues/5) reports that starting multiple interceptor instances and stopping them out of order corrupts the global `fetch` and `XMLHttpRequest` restoration flow.

This change will make concurrent interceptor instances compose safely.

## Problem

Each interceptor currently patches global browser APIs independently and stores the globals it saw at `start()` time. That means:

- interceptor B can capture interceptor A's patched globals as its "original"
- stopping A can disable B even though B is still active
- stopping B later can restore A's patched globals instead of the native implementations

The result is stop-order-sensitive global state.

## Chosen Approach

Use a shared runtime registry for active interceptors.

- Global `fetch` and `XMLHttpRequest` patches are installed once when the first interceptor starts
- Interceptor instances register resolved runtime options into the shared registry
- Interceptor instances unregister on `stop()`
- Native globals are restored only when the last active interceptor stops

## Request Lifecycle Semantics

Matching interceptors are snapshotted when a request is initiated.

- `fetch`: snapshot active interceptors before awaiting the original fetch result
- `XMLHttpRequest`: snapshot active interceptors when `send()` is called

This preserves existing single-interceptor semantics:

- an interceptor active when a request starts still receives the callback even if it stops before the response arrives
- an interceptor started after a request begins does not observe that in-flight request

## Implementation Notes

- Move the shared runtime interceptor type into `src/types.ts`
- Add a small runtime module that owns the active interceptor registry and patch lifecycle
- Update fetch/XHR patch helpers to work from a runtime interceptor snapshot instead of a single interceptor instance
- Keep matcher and callback error handling delegated to the existing safe helper functions

## Testing

Add unit coverage for:

- start A, start B, stop A, ensure B still intercepts fetch and XHR
- restore native globals only after the final interceptor stops
- fetch request snapshots so late-started interceptors do not observe already in-flight requests
