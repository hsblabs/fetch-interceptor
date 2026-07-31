---
"@hsblabs/fetch-interceptor": minor
---

Preserve original fetch and XHR outcomes when request or response observation fails, normalize XHR no-body and status-0 responses safely, and make adapter installation transactional.

Keep failed adapter restoration retriable without stacking interception, make fetch error classification safe for arbitrary rejection values, narrow `FetchInterceptorError` by transport, and remove the runtime-only options type from package exports.
