---
"@hsblabs/fetch-interceptor": minor
---

Add `onError` support for failed `fetch` and `XMLHttpRequest` requests.

Failed interceptions now expose normalized error details with `transport`, `reason`, and `cause`, and the XHR interception flow cleans up terminal event listeners correctly across repeated sends. Type checking is also available through `pnpm test:types`.
