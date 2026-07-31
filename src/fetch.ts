import {
	createInterceptionSnapshotSafely,
	runInterceptionSnapshotOnError,
	runInterceptionSnapshotOnSuccess,
} from "./callbacks";
import type { ResolvedInterceptorOptions } from "./internal-types";
import type { FetchInterceptorError } from "./types";

type NormalizedFetchError = Extract<
	FetchInterceptorError,
	{ transport: "fetch" }
>;

function isAbortError(error: unknown): boolean {
	try {
		if (typeof DOMException !== "undefined" && error instanceof DOMException) {
			return error.name === "AbortError";
		}

		if (typeof error !== "object" || error === null) {
			return false;
		}

		return "name" in error && error.name === "AbortError";
	} catch {
		return false;
	}
}

function createFetchInterceptorError(error: unknown): NormalizedFetchError {
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

function createFetchHandlerForActiveInterceptors(
	originalFetch: typeof globalThis.fetch,
	getActiveInterceptors: () => readonly ResolvedInterceptorOptions[],
): typeof globalThis.fetch {
	return async function interceptedFetch(
		...args: Parameters<typeof globalThis.fetch>
	) {
		const activeInterceptors = getActiveInterceptors();
		const interceptionSnapshot = createInterceptionSnapshotSafely(
			() => createFetchRequest(...args),
			activeInterceptors,
		);

		let response: Response;

		try {
			response = await originalFetch(...args);
		} catch (error) {
			runInterceptionSnapshotOnError(
				interceptionSnapshot,
				createFetchInterceptorError(error),
			);
			throw error;
		}

		runInterceptionSnapshotOnSuccess(interceptionSnapshot, () => response);
		return response;
	};
}

export function interceptFetch(
	getActiveInterceptors: () => readonly ResolvedInterceptorOptions[],
): () => void {
	const originalFetch = globalThis.fetch;

	globalThis.fetch = createFetchHandlerForActiveInterceptors(
		originalFetch,
		getActiveInterceptors,
	);

	return function restoreFetch() {
		globalThis.fetch = originalFetch;
	};
}
