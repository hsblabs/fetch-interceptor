import { matchesRequestSafely, runOnInterceptSafely } from "./callbacks";
import type { FetchInterceptorOptions } from "./types";

type RuntimeInterceptorOptions = Omit<FetchInterceptorOptions, "matcher"> & {
	matcher: NonNullable<FetchInterceptorOptions["matcher"]>;
};

export function createFetchRequest(
	...args: Parameters<typeof globalThis.fetch>
): Request {
	const [input, init] = args;

	if (input instanceof Request) {
		return input.clone();
	}

	return new Request(input, init);
}

export function createFetchInterceptorHandler(
	originalFetch: typeof globalThis.fetch,
	options: RuntimeInterceptorOptions,
): typeof globalThis.fetch {
	return async function interceptedFetch(
		...args: Parameters<typeof globalThis.fetch>
	) {
		const request = createFetchRequest(...args);
		const response = await originalFetch(...args);

		if (matchesRequestSafely(request, options.matcher)) {
			runOnInterceptSafely(request, response.clone(), options.onIntercept);
		}

		return response;
	};
}

/**
 * Intercepts globalThis.fetch and returns a restore function.
 */
export function interceptFetch(options: RuntimeInterceptorOptions): () => void {
	const originalFetch = globalThis.fetch;

	globalThis.fetch = createFetchInterceptorHandler(originalFetch, options);

	// Return a cleanup function.
	return function restoreFetch() {
		globalThis.fetch = originalFetch;
	};
}
