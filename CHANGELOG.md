# CHANGELOG

## 0.3.0

### Minor Changes

- 06a1067: Preserve original fetch and XHR outcomes when request or response observation fails, normalize XHR no-body and status-0 responses safely, and make adapter installation transactional.

  Keep failed adapter restoration retriable without stacking interception, make fetch error classification safe for arbitrary rejection values, narrow `FetchInterceptorError` by transport, and remove the runtime-only options type from package exports.

## 0.2.0

- Add `onError` support for failed `fetch` and `XMLHttpRequest` requests.
- Normalize failures with transport, reason, and cause details.
- Clean up XHR terminal event listeners correctly across repeated sends.
- Add workspace type checking through `pnpm test:types`.

## 0.1.1

- Preserve `RequestInit` overrides passed to `fetch(request, init)`.
- Restore fetch and XHR globals correctly when multiple interceptors stop out of order.
- Preserve original network results when interceptor callbacks throw or reject.
- Normalize JSON-style XHR responses into readable standard `Response` bodies.

## 0.1.0

- Release the first feature-complete public version of the fetch/XHR interceptor library.

## 0.0.1

- Initial release of `@hsblabs/fetch-interceptor`.
- Add interception support for browser `fetch` and `XMLHttpRequest`.
- Normalize intercepted traffic to standard `Request` and `Response` objects.
