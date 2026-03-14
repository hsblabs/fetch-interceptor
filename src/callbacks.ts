import type { FetchInterceptorOptions } from "./types";

const CALLBACK_ERROR_PREFIX =
	"[fetch-interceptor] Interceptor callback failed. The original request result was preserved.";

function reportCallbackError(error: unknown): void {
	try {
		console.error(CALLBACK_ERROR_PREFIX, error);
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
		reportCallbackError(error);
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
		void Promise.resolve(result).catch(reportCallbackError);
	} catch (error) {
		reportCallbackError(error);
	}
}
