import { registerInterceptor, unregisterInterceptor } from "./runtime";
import type { FetchInterceptor, FetchInterceptorOptions } from "./types";

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
	const interceptorId = Symbol("fetch-interceptor");
	const resolvedOptions = {
		...options,
		matcher: options.matcher ?? matchAllRequests,
	};

	const start = () => {
		if (isRunning) return;
		isRunning = true;

		registerInterceptor(interceptorId, resolvedOptions);
	};

	const stop = () => {
		if (!isRunning) return;
		isRunning = false;

		unregisterInterceptor(interceptorId);
	};

	return { start, stop };
}
