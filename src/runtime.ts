import { throwCollectedErrors } from "./error-aggregation";
import { interceptFetch } from "./fetch";
import type { ResolvedInterceptorOptions } from "./internal-types";
import { interceptXhr } from "./xhr";

const activeInterceptors = new Map<symbol, ResolvedInterceptorOptions>();

let restoreFetch: (() => void) | null = null;
let restoreXhr: (() => void) | null = null;

function getActiveInterceptors(): ResolvedInterceptorOptions[] {
	return Array.from(activeInterceptors.values());
}

export function registerInterceptor(
	interceptorId: symbol,
	options: ResolvedInterceptorOptions,
): void {
	if (activeInterceptors.has(interceptorId)) {
		return;
	}

	if (activeInterceptors.size > 0) {
		activeInterceptors.set(interceptorId, options);
		return;
	}

	let nextRestoreFetch: (() => void) | null = null;

	try {
		nextRestoreFetch = interceptFetch(getActiveInterceptors);
		const nextRestoreXhr = interceptXhr(getActiveInterceptors);

		activeInterceptors.set(interceptorId, options);
		restoreFetch = nextRestoreFetch;
		restoreXhr = nextRestoreXhr;
	} catch (error) {
		const rollbackErrors: unknown[] = [error];

		if (nextRestoreFetch) {
			try {
				nextRestoreFetch();
			} catch (rollbackError) {
				rollbackErrors.push(rollbackError);
			}
		}

		throwCollectedErrors(
			"Failed to install interception and restore the original globals.",
			rollbackErrors,
		);
	}
}

export function unregisterInterceptor(interceptorId: symbol): void {
	if (!activeInterceptors.has(interceptorId)) {
		return;
	}

	if (activeInterceptors.size > 1) {
		activeInterceptors.delete(interceptorId);
		return;
	}

	const restorationErrors: unknown[] = [];

	if (restoreFetch) {
		try {
			restoreFetch();
			restoreFetch = null;
		} catch (error) {
			restorationErrors.push(error);
		}
	}

	if (restoreXhr) {
		try {
			restoreXhr();
			restoreXhr = null;
		} catch (error) {
			restorationErrors.push(error);
		}
	}

	throwCollectedErrors(
		"Failed to restore one or more original globals.",
		restorationErrors,
	);

	activeInterceptors.delete(interceptorId);
}
