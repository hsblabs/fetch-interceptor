import type { FetchInterceptorError } from "./types";

export function assertErrorNarrowing(error: FetchInterceptorError): void {
	if (error.transport === "fetch") {
		const reason: "abort" | "error" = error.reason;
		void reason;
		return;
	}

	const reason: "abort" | "error" | "timeout" = error.reason;
	const cause: ProgressEvent<XMLHttpRequestEventTarget> = error.cause;
	void reason;
	void cause;
}

// @ts-expect-error Fetch does not produce the XHR-only timeout reason.
const invalidFetchTimeout: FetchInterceptorError = {
	cause: new Error("timeout"),
	reason: "timeout",
	transport: "fetch",
};

void invalidFetchTimeout;
