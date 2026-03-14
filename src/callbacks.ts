import type {
	FetchInterceptorError,
	FetchInterceptorOptions,
	RuntimeInterceptorOptions,
} from "./types";

type InterceptorCallbackKind = "matcher" | "onError" | "onIntercept";

export type InterceptionSnapshot = Array<{
	onError?: FetchInterceptorOptions["onError"];
	onIntercept: FetchInterceptorOptions["onIntercept"];
	request: Request;
}>;

function reportCallbackError(
	kind: InterceptorCallbackKind,
	error: unknown,
): void {
	const message = `[fetch-interceptor] ${kind} callback failed. The original request result was preserved.`;

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
		reportCallbackError("matcher", error);
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
			reportCallbackError("onIntercept", error);
		});
	} catch (error) {
		reportCallbackError("onIntercept", error);
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
			reportCallbackError("onError", callbackError);
		});
	} catch (error) {
		reportCallbackError("onError", error);
	}
}

export function createInterceptionSnapshot(
	request: Request,
	interceptors: RuntimeInterceptorOptions[],
): InterceptionSnapshot {
	const snapshot: InterceptionSnapshot = [];

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

export function runInterceptionSnapshotOnSuccess(
	snapshot: InterceptionSnapshot,
	createResponse: () => Response,
): void {
	let sharedResponse: Response | null = null;

	for (const interceptor of snapshot) {
		sharedResponse ??= createResponse();

		runOnInterceptSafely(
			interceptor.request,
			sharedResponse.clone(),
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
