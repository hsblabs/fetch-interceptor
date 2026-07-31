type FetchTransportError = Readonly<{
	cause: unknown;
	reason: "abort" | "error";
	transport: "fetch";
}>;

type XhrTransportError = Readonly<{
	cause: ProgressEvent<XMLHttpRequestEventTarget>;
	reason: "abort" | "error" | "timeout";
	transport: "xhr";
}>;

/** A failure produced by the underlying transport before a response exists. */
export type FetchInterceptorError = FetchTransportError | XhrTransportError;

export type FetchInterceptorErrorReason = FetchInterceptorError["reason"];

/** Consumer callbacks and filtering for an interceptor instance. */
export interface FetchInterceptorOptions {
	/**
	 * Selects requests to observe. A thrown exception is reported and treated as
	 * a non-match without changing the network result.
	 */
	matcher?: (request: Request) => boolean;

	/**
	 * Observes a matched request and an independent response clone. Exceptions
	 * and rejected promises are reported without changing the network result.
	 */
	onIntercept: (request: Request, response: Response) => void | Promise<void>;

	/**
	 * Observes an underlying transport failure before a response exists. Callback
	 * failures are reported without replacing the original transport failure.
	 */
	onError?: (
		request: Request,
		error: FetchInterceptorError,
	) => void | Promise<void>;
}

/**
 * Lifecycle control for one registration. Successful transitions are
 * idempotent. Failed installation leaves the interceptor stopped; failed
 * restoration keeps it active so `stop()` can retry the remaining adapters.
 */
export interface FetchInterceptor {
	/** Installs both transport adapters or rolls back and throws. */
	start: () => void;
	/** Restores every adapter or throws while retaining failed restorations. */
	stop: () => void;
}
