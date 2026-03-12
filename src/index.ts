import { interceptFetch } from "./fetch";
import type { FetchInterceptor, FetchInterceptorOptions } from "./types";
import { interceptXhr } from "./xhr";

export * from "./types";

const matchAllRequests = () => true;

/**
 * Creates a FetchInterceptor instance that intercepts network traffic.
 * @param options Matcher and callback options for interception.
 * @returns A control interface with start and stop methods.
 */
export function createFetchInterceptor(
	options: FetchInterceptorOptions,
): FetchInterceptor {
	let isRunning = false;
	const resolvedOptions = {
		...options,
		matcher: options.matcher ?? matchAllRequests,
	};

	// Hold the cleanup functions returned by each interception module.
	let restoreFetch: (() => void) | null = null;
	let restoreXhr: (() => void) | null = null;

	const start = () => {
		if (isRunning) return;
		isRunning = true;

		// Start fetch and xhr interception and keep their restore handlers.
		restoreFetch = interceptFetch(resolvedOptions);
		restoreXhr = interceptXhr(resolvedOptions);
	};

	const stop = () => {
		if (!isRunning) return;
		isRunning = false;

		// Run the stored restore handlers to put globals back in place.
		if (restoreFetch) restoreFetch();
		if (restoreXhr) restoreXhr();

		// Clear the stored references.
		restoreFetch = null;
		restoreXhr = null;
	};

	return { start, stop };
}
