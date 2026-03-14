import {
	createInterceptionSnapshot,
	matchesRequestSafely,
	runInterceptionSnapshotOnError,
	runInterceptionSnapshotOnSuccess,
	runOnErrorSafely,
	runOnInterceptSafely,
} from "./callbacks";
import type { FetchInterceptorError, RuntimeInterceptorOptions } from "./types";

function isAbortError(error: unknown): boolean {
	if (typeof DOMException !== "undefined" && error instanceof DOMException) {
		return error.name === "AbortError";
	}

	if (typeof error !== "object" || error === null) {
		return false;
	}

	return "name" in error && error.name === "AbortError";
}

function createFetchInterceptorError(error: unknown): FetchInterceptorError {
	return {
		cause: error,
		reason: isAbortError(error) ? "abort" : "error",
		transport: "fetch",
	};
}

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
		const shouldIntercept = matchesRequestSafely(request, options.matcher);

		try {
			const response = await originalFetch(...args);

			if (shouldIntercept) {
				runOnInterceptSafely(request, response.clone(), options.onIntercept);
			}

			return response;
		} catch (error) {
			if (shouldIntercept) {
				runOnErrorSafely(
					request,
					createFetchInterceptorError(error),
					options.onError,
				);
			}

			throw error;
		}
	};
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
				: createInterceptionSnapshot(
						createFetchRequest(...args),
						activeInterceptors,
					);

		try {
			const response = await originalFetch(...args);
			runInterceptionSnapshotOnSuccess(interceptionSnapshot, () =>
				response.clone(),
			);
			return response;
		} catch (error) {
			runInterceptionSnapshotOnError(
				interceptionSnapshot,
				createFetchInterceptorError(error),
			);
			throw error;
		}
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

	return function restoreFetch() {
		globalThis.fetch = originalFetch;
	};
}
