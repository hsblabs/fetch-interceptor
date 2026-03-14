import { interceptFetch } from "./fetch";
import type { RuntimeInterceptorOptions } from "./types";
import { interceptXhr } from "./xhr";

const activeInterceptors = new Map<symbol, RuntimeInterceptorOptions>();

let restoreFetch: (() => void) | null = null;
let restoreXhr: (() => void) | null = null;

function getActiveInterceptors(): RuntimeInterceptorOptions[] {
	return Array.from(activeInterceptors.values());
}

export function registerInterceptor(
	interceptorId: symbol,
	options: RuntimeInterceptorOptions,
): void {
	if (activeInterceptors.has(interceptorId)) {
		return;
	}

	activeInterceptors.set(interceptorId, options);

	if (activeInterceptors.size !== 1) {
		return;
	}

	restoreFetch = interceptFetch(getActiveInterceptors);
	restoreXhr = interceptXhr(getActiveInterceptors);
}

export function unregisterInterceptor(interceptorId: symbol): void {
	if (!activeInterceptors.delete(interceptorId)) {
		return;
	}

	if (activeInterceptors.size > 0) {
		return;
	}

	if (restoreFetch) {
		restoreFetch();
		restoreFetch = null;
	}

	if (restoreXhr) {
		restoreXhr();
		restoreXhr = null;
	}
}
