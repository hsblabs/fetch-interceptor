import {
	createInterceptionSnapshotSafely,
	runInterceptionSnapshotOnError,
	runInterceptionSnapshotOnSuccess,
} from "./callbacks";
import { throwCollectedErrors } from "./error-aggregation";
import type { ResolvedInterceptorOptions } from "./internal-types";
import type { FetchInterceptorError } from "./types";
import {
	createXhrRequest,
	createXhrResponse,
	type XhrRequestMetadata,
} from "./xhr-normalization";

type XhrOpenShort = (method: string, url: string | URL) => void;
type XhrOpenLong = (
	method: string,
	url: string | URL,
	async: boolean,
	username?: string | null,
	password?: string | null,
) => void;

type NormalizedXhrError = Extract<FetchInterceptorError, { transport: "xhr" }>;
type XhrFailureReason = NormalizedXhrError["reason"];
type XhrTerminalEventType = XhrFailureReason | "load";
type XhrTerminalEvent = ProgressEvent<XMLHttpRequestEventTarget>;
type XhrTerminalHandler = (event: XhrTerminalEvent) => void;
type XhrTerminalHandlers = Readonly<
	Record<XhrTerminalEventType, XhrTerminalHandler>
>;

function createXhrInterceptorError(
	cause: XhrTerminalEvent,
	reason: XhrFailureReason,
): NormalizedXhrError {
	return {
		cause,
		reason,
		transport: "xhr",
	};
}

function detachXhrTerminalHandlers(
	xhr: XMLHttpRequest,
	handlers: XhrTerminalHandlers | undefined,
): void {
	if (!handlers) {
		return;
	}

	xhr.removeEventListener("load", handlers.load);
	xhr.removeEventListener("error", handlers.error);
	xhr.removeEventListener("abort", handlers.abort);
	xhr.removeEventListener("timeout", handlers.timeout);
}

function attachXhrTerminalHandlers(
	xhr: XMLHttpRequest,
	interceptionSnapshot: ReturnType<typeof createInterceptionSnapshotSafely>,
	xhrTerminalHandlersMap: WeakMap<XMLHttpRequest, XhrTerminalHandlers>,
): void {
	detachXhrTerminalHandlers(xhr, xhrTerminalHandlersMap.get(xhr));

	const cleanup = () => {
		detachXhrTerminalHandlers(xhr, xhrTerminalHandlersMap.get(xhr));
		xhrTerminalHandlersMap.delete(xhr);
	};

	const handlers: XhrTerminalHandlers = {
		load: () => {
			cleanup();
			runInterceptionSnapshotOnSuccess(interceptionSnapshot, () =>
				createXhrResponse(xhr),
			);
		},
		error: (event) => {
			cleanup();
			runInterceptionSnapshotOnError(
				interceptionSnapshot,
				createXhrInterceptorError(event, "error"),
			);
		},
		abort: (event) => {
			cleanup();
			runInterceptionSnapshotOnError(
				interceptionSnapshot,
				createXhrInterceptorError(event, "abort"),
			);
		},
		timeout: (event) => {
			cleanup();
			runInterceptionSnapshotOnError(
				interceptionSnapshot,
				createXhrInterceptorError(event, "timeout"),
			);
		},
	};

	xhrTerminalHandlersMap.set(xhr, handlers);
	xhr.addEventListener("load", handlers.load);
	xhr.addEventListener("error", handlers.error);
	xhr.addEventListener("abort", handlers.abort);
	xhr.addEventListener("timeout", handlers.timeout);
}

export function interceptXhr(
	getActiveInterceptors: () => readonly ResolvedInterceptorOptions[],
): () => void {
	if (typeof XMLHttpRequest === "undefined") {
		return () => {};
	}

	const xhrPrototype = XMLHttpRequest.prototype;
	const originalXhrOpen = xhrPrototype.open;
	const originalXhrOpenShort = originalXhrOpen as XhrOpenShort;
	const originalXhrOpenLong = originalXhrOpen as XhrOpenLong;
	const originalXhrSend = xhrPrototype.send;
	const originalXhrSetRequestHeader = xhrPrototype.setRequestHeader;

	// Store metadata in a WeakMap keyed by each XHR instance.
	// Entries disappear with the instance, so this does not leak memory.
	const xhrMetadataMap = new WeakMap<XMLHttpRequest, XhrRequestMetadata>();
	const xhrTerminalHandlersMap = new WeakMap<
		XMLHttpRequest,
		XhrTerminalHandlers
	>();

	const interceptedXhrOpen = function (
		this: XMLHttpRequest,
		method: string,
		url: string | URL,
		async?: boolean,
		username?: string | null,
		password?: string | null,
	) {
		xhrMetadataMap.set(this, {
			method: method.toUpperCase(),
			url: url.toString(),
			headers: [],
		});

		if (
			async === undefined &&
			username === undefined &&
			password === undefined
		) {
			return originalXhrOpenShort.call(this, method, url);
		}

		return originalXhrOpenLong.call(
			this,
			method,
			url,
			async ?? true,
			username,
			password,
		);
	};

	const interceptedXhrSetRequestHeader = function (
		this: XMLHttpRequest,
		...args: Parameters<XMLHttpRequest["setRequestHeader"]>
	) {
		const [name, value] = args;
		const metadata = xhrMetadataMap.get(this);
		const result = originalXhrSetRequestHeader.apply(this, args);

		if (metadata) {
			xhrMetadataMap.set(this, {
				...metadata,
				headers: [...metadata.headers, [name, value]],
			});
		}

		return result;
	};

	const interceptedXhrSend = function (
		this: XMLHttpRequest,
		...args: Parameters<XMLHttpRequest["send"]>
	) {
		const [body] = args;
		const metadata = xhrMetadataMap.get(this);

		detachXhrTerminalHandlers(this, xhrTerminalHandlersMap.get(this));
		xhrTerminalHandlersMap.delete(this);

		if (metadata) {
			const activeInterceptors = getActiveInterceptors();

			if (activeInterceptors.length > 0) {
				const interceptionSnapshot = createInterceptionSnapshotSafely(
					() => createXhrRequest(metadata, body),
					activeInterceptors,
				);

				if (interceptionSnapshot.length > 0) {
					attachXhrTerminalHandlers(
						this,
						interceptionSnapshot,
						xhrTerminalHandlersMap,
					);
				}
			}
		}

		return originalXhrSend.apply(this, args);
	};

	let installedOpen = false;
	let installedSend = false;
	let installedSetRequestHeader = false;

	const restoreInstalledMethods = () => {
		const restorationErrors: unknown[] = [];

		if (installedSend) {
			try {
				xhrPrototype.send = originalXhrSend;
				installedSend = false;
			} catch (error) {
				restorationErrors.push(error);
			}
		}

		if (installedSetRequestHeader) {
			try {
				xhrPrototype.setRequestHeader = originalXhrSetRequestHeader;
				installedSetRequestHeader = false;
			} catch (error) {
				restorationErrors.push(error);
			}
		}

		if (installedOpen) {
			try {
				xhrPrototype.open = originalXhrOpen;
				installedOpen = false;
			} catch (error) {
				restorationErrors.push(error);
			}
		}

		throwCollectedErrors(
			"Failed to restore one or more XMLHttpRequest methods.",
			restorationErrors,
		);
	};

	try {
		xhrPrototype.open = interceptedXhrOpen;
		installedOpen = true;
		xhrPrototype.setRequestHeader = interceptedXhrSetRequestHeader;
		installedSetRequestHeader = true;
		xhrPrototype.send = interceptedXhrSend;
		installedSend = true;
	} catch (error) {
		try {
			restoreInstalledMethods();
		} catch (rollbackError) {
			throw new AggregateError(
				[error, rollbackError],
				"Failed to install and roll back XMLHttpRequest interception.",
			);
		}

		throw error;
	}

	return function restoreXhr() {
		restoreInstalledMethods();
	};
}
