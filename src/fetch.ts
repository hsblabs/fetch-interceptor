import { matchesRequestSafely, runOnInterceptSafely } from "./callbacks";
import type { RuntimeInterceptorOptions } from "./types";

type FetchInterceptionSnapshot = Array<{
	onIntercept: RuntimeInterceptorOptions["onIntercept"];
	request: Request;
}>;

export function createFetchRequest(
	...args: Parameters<typeof globalThis.fetch>
): Request {
	const [input, init] = args;

	if (input instanceof Request) {
		return new Request(input.clone(), init);
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

function createFetchInterceptionSnapshot(
	request: Request,
	interceptors: RuntimeInterceptorOptions[],
): FetchInterceptionSnapshot {
	const snapshot: FetchInterceptionSnapshot = [];

	for (const interceptor of interceptors) {
		const interceptedRequest = request.clone();

		if (matchesRequestSafely(interceptedRequest, interceptor.matcher)) {
			snapshot.push({
				request: interceptedRequest,
				onIntercept: interceptor.onIntercept,
			});
		}
	}

	return snapshot;
}

function createSharedFetchInterceptorHandler(
	originalFetch: typeof globalThis.fetch,
	getActiveInterceptors: () => RuntimeInterceptorOptions[],
): typeof globalThis.fetch {
	return async function interceptedFetch(
		...args: Parameters<typeof globalThis.fetch>
	) {
		const activeInterceptors = getActiveInterceptors();
		const interceptionSnapshot =
			activeInterceptors.length === 0
				? []
				: createFetchInterceptionSnapshot(
						createFetchRequest(...args),
						activeInterceptors,
					);
		const response = await originalFetch(...args);

		for (const interceptor of interceptionSnapshot) {
			runOnInterceptSafely(
				interceptor.request,
				response.clone(),
				interceptor.onIntercept,
			);
		}

		return response;
	};
}

/**
 * Intercepts globalThis.fetch and returns a restore function.
 */
export function interceptFetch(
	getActiveInterceptors: () => RuntimeInterceptorOptions[],
): () => void {
	const originalFetch = globalThis.fetch;

	globalThis.fetch = createSharedFetchInterceptorHandler(
		originalFetch,
		getActiveInterceptors,
	);

	// Return a cleanup function.
	return function restoreFetch() {
		globalThis.fetch = originalFetch;
	};
}
