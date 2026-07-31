import type { ResolvedInterceptorOptions } from "./internal-types";
import type { FetchInterceptorError, FetchInterceptorOptions } from "./types";

type InterceptionFailureSource =
	| "matcher callback"
	| "onError callback"
	| "onIntercept callback"
	| "request observation"
	| "response observation";

export type InterceptionSnapshot = readonly Readonly<{
	onError?: FetchInterceptorOptions["onError"];
	onIntercept: FetchInterceptorOptions["onIntercept"];
	request: Request;
}>[];

function reportInterceptionFailure(
	source: InterceptionFailureSource,
	error: unknown,
): void {
	const message = `[fetch-interceptor] ${source} failed. The original request result was preserved.`;

	try {
		console.error(message, error);
	} catch {
		// Ignore logging failures to keep interception observational.
	}
}

export function matchesRequestSafely(
	request: Request,
	matcher: NonNullable<FetchInterceptorOptions["matcher"]>,
): boolean {
	try {
		return matcher(request);
	} catch (error) {
		reportInterceptionFailure("matcher callback", error);
		return false;
	}
}

export function runOnInterceptSafely(
	request: Request,
	response: Response,
	onIntercept: FetchInterceptorOptions["onIntercept"],
): void {
	try {
		const result = onIntercept(request, response);
		void Promise.resolve(result).catch((error) => {
			reportInterceptionFailure("onIntercept callback", error);
		});
	} catch (error) {
		reportInterceptionFailure("onIntercept callback", error);
	}
}

export function runOnErrorSafely(
	request: Request,
	error: FetchInterceptorError,
	onError: FetchInterceptorOptions["onError"],
): void {
	if (!onError) {
		return;
	}

	try {
		const result = onError(request, error);
		void Promise.resolve(result).catch((callbackError) => {
			reportInterceptionFailure("onError callback", callbackError);
		});
	} catch (error) {
		reportInterceptionFailure("onError callback", error);
	}
}

function createInterceptionSnapshot(
	request: Request,
	interceptors: readonly ResolvedInterceptorOptions[],
): InterceptionSnapshot {
	const snapshot: InterceptionSnapshot[number][] = [];

	for (const interceptor of interceptors) {
		const interceptedRequest = request.clone();

		if (matchesRequestSafely(interceptedRequest, interceptor.matcher)) {
			snapshot.push({
				request: interceptedRequest,
				onIntercept: interceptor.onIntercept,
				onError: interceptor.onError,
			});
		}
	}

	return snapshot;
}

export function createInterceptionSnapshotSafely(
	createRequest: () => Request,
	interceptors: readonly ResolvedInterceptorOptions[],
): InterceptionSnapshot {
	if (interceptors.length === 0) {
		return [];
	}

	try {
		return createInterceptionSnapshot(createRequest(), interceptors);
	} catch (error) {
		reportInterceptionFailure("request observation", error);
		return [];
	}
}

export function runInterceptionSnapshotOnSuccess(
	snapshot: InterceptionSnapshot,
	createResponse: () => Response,
): void {
	if (snapshot.length === 0) {
		return;
	}

	let sharedResponse: Response;

	try {
		sharedResponse = createResponse();
	} catch (error) {
		reportInterceptionFailure("response observation", error);
		return;
	}

	for (const interceptor of snapshot) {
		let response: Response;

		try {
			response = sharedResponse.clone();
		} catch (error) {
			reportInterceptionFailure("response observation", error);
			return;
		}

		runOnInterceptSafely(
			interceptor.request,
			response,
			interceptor.onIntercept,
		);
	}
}

export function runInterceptionSnapshotOnError(
	snapshot: InterceptionSnapshot,
	error: FetchInterceptorError,
): void {
	for (const interceptor of snapshot) {
		runOnErrorSafely(interceptor.request, error, interceptor.onError);
	}
}
