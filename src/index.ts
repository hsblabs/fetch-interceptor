import type { ResolvedInterceptorOptions } from "./internal-types";
import { registerInterceptor, unregisterInterceptor } from "./runtime";
import type { FetchInterceptor, FetchInterceptorOptions } from "./types";

export type {
	FetchInterceptor,
	FetchInterceptorError,
	FetchInterceptorErrorReason,
	FetchInterceptorOptions,
} from "./types";

const matchAllRequests = () => true;

/**
 * Creates an inactive interceptor. Omitting `matcher` observes every request;
 * call `start()` to register it and `stop()` to restore it.
 */
export function createFetchInterceptor(
	options: FetchInterceptorOptions,
): FetchInterceptor {
	let isRunning = false;
	const interceptorId = Symbol("fetch-interceptor");
	const resolvedOptions: ResolvedInterceptorOptions = {
		...options,
		matcher: options.matcher ?? matchAllRequests,
	};

	const start = () => {
		if (isRunning) return;

		registerInterceptor(interceptorId, resolvedOptions);
		isRunning = true;
	};

	const stop = () => {
		if (!isRunning) return;

		try {
			unregisterInterceptor(interceptorId);
		} finally {
			isRunning = false;
		}
	};

	return { start, stop };
}
