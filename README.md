# @hsblabs/fetch-interceptor

Language:
[English](https://github.com/hsblabs/fetch-interceptor/blob/main/README.md)
| [日本語](https://github.com/hsblabs/fetch-interceptor/blob/main/docs/README/ja.md)
| [简体中文](https://github.com/hsblabs/fetch-interceptor/blob/main/docs/README/zh-CN.md)
| [한국어](https://github.com/hsblabs/fetch-interceptor/blob/main/docs/README/ko.md)

`@hsblabs/fetch-interceptor` is a lightweight TypeScript library for transparently intercepting browser `fetch` and `XMLHttpRequest` traffic.

Its key feature is that intercepted requests and responses are normalized to the standard Web API `Request` and `Response` objects. That lets you inspect and process XHR traffic without dealing with XHR-specific lifecycle complexity.

## Features

- Unified around standard APIs
  Both fetch and XHR traffic can be handled through `Request` and `Response`.
- Fully type-safe
  The API is predictable and comfortable to use in TypeScript.
- Safe lifecycle control
  A factory-based API lets you start interception when needed and restore native browser APIs cleanly.
- Zero dependencies
  The library stays small and easy to embed.
- Built for browser environments
  The API is intentionally simple for frontend integrations.

## Installation

```sh
npm install @hsblabs/fetch-interceptor
# or
yarn add @hsblabs/fetch-interceptor
# or
pnpm add @hsblabs/fetch-interceptor
# or
bun add @hsblabs/fetch-interceptor
```

## Development

```sh
pnpm test
pnpm test:e2e:node
pnpm test:e2e:browser
```

Before running browser E2E tests for the first time, install Playwright Chromium with `pnpm test:e2e:install`.

## Usage

The library is designed to stay small at the call site. The example below intercepts only a specific API route and extracts JSON from the response.

```ts
import { createFetchInterceptor } from "@hsblabs/fetch-interceptor";

const interceptor = createFetchInterceptor({
	matcher: (req) => {
		const url = new URL(req.url);
		return url.pathname.includes("/api/target-data") && req.method === "GET";
	},
	onIntercept: async (req, res) => {
		try {
			const data = await res.json();
			console.log("Intercepted data:", data);

			// For example, forward data from a Chrome extension's main world
			// to an isolated world:
			// window.postMessage({ type: "INTERCEPTED_DATA", payload: data }, "*");
		} catch (error) {
			console.error("Failed to parse intercepted response:", error);
		}
	},
});

interceptor.start();

// ...do work...

// interceptor.stop();
```

## API Reference

### `createFetchInterceptor(options: FetchInterceptorOptions): FetchInterceptor`

Creates an interceptor instance used to start and stop traffic interception.

### `FetchInterceptorOptions`

| Property | Type | Description |
| --- | --- | --- |
| `matcher` | `((req: Request) => boolean)?` | Predicate that decides whether a request should be intercepted. When omitted, all matching traffic is intercepted. |
| `onIntercept` | `(req: Request, res: Response) => void` | Callback invoked when a matching request completes. `res` is a cloned response for fetch, or an equivalent standard `Response` for XHR. |

### `FetchInterceptor`

| Method | Description |
| --- | --- |
| `start()` | Overrides `fetch` and `XMLHttpRequest` to begin interception. Calling it more than once is safe. |
| `stop()` | Stops interception and restores the original browser APIs. |

## Use Cases

- Data extraction in browser extensions
  Capture underlying REST or GraphQL responses directly from an SPA.
- Debugging and logging
  Observe requests and responses for a specific API surface.
- Test instrumentation
  Watch network activity and trigger test flow based on real responses.

## Why This Library

Cross-cutting browser traffic tooling gets messy when `fetch` and XHR need separate handling. `@hsblabs/fetch-interceptor` removes that split so you can focus on monitoring, extraction, debugging, and automation with a single `Request` / `Response` mental model.

## Contributing

Contributions are welcome.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the contribution workflow and [docs/label-policy.md](./docs/label-policy.md) for the issue label policy.

## License

MIT
