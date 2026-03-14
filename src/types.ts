export type FetchInterceptorErrorReason = "abort" | "error" | "timeout";

export interface FetchInterceptorError {
	cause: unknown;
	reason: FetchInterceptorErrorReason;
	transport: "fetch" | "xhr";
}

/**
 * Initialization options for FetchInterceptor.
 */
export interface FetchInterceptorOptions {
	/**
	 * Determines whether a request should be intercepted.
	 * @param req A standard Request object.
	 * @returns Returns true when the request should be intercepted.
	 */
	matcher?: (req: Request) => boolean;

	/**
	 * Callback invoked when an intercepted request completes successfully.
	 * @param req A standard Request object.
	 * @param res A standard Response object, or a cloned equivalent.
	 */
	onIntercept: (req: Request, res: Response) => void | Promise<void>;

	/**
	 * Callback invoked when an intercepted request fails before producing a response.
	 * @param req A standard Request object.
	 * @param error Normalized fetch/XHR failure details.
	 */
	onError?: (
		req: Request,
		error: FetchInterceptorError,
	) => void | Promise<void>;
}

/**
 * Runtime options after default values have been resolved.
 */
export type RuntimeInterceptorOptions = Omit<
	FetchInterceptorOptions,
	"matcher"
> & {
	matcher: NonNullable<FetchInterceptorOptions["matcher"]>;
};

/**
 * FetchInterceptor instance exposed to consumers.
 */
export interface FetchInterceptor {
	/** Starts interception. */
	start: () => void;
	/** Stops interception and restores the original global objects. */
	stop: () => void;
}
