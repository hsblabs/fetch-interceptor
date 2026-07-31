# CHANGELOG

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
