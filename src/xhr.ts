import {
	createInterceptionSnapshot,
	matchesRequestSafely,
	runInterceptionSnapshotOnError,
	runInterceptionSnapshotOnSuccess,
	runOnInterceptSafely,
} from "./callbacks";
import type {
	FetchInterceptorError,
	FetchInterceptorErrorReason,
	RuntimeInterceptorOptions,
} from "./types";

// Tracks request metadata associated with each XHR instance.
export interface XhrInterceptorData {
	method: string;
	url: string;
	headers: Headers;
}

type XhrOpenShort = (method: string, url: string | URL) => void;
type XhrOpenLong = (
	method: string,
	url: string | URL,
	async: boolean,
	username?: string | null,
	password?: string | null,
) => void;

type XhrResponseSource = Pick<
	XMLHttpRequest,
	| "getAllResponseHeaders"
	| "response"
	| "responseType"
	| "responseText"
	| "status"
	| "statusText"
>;

type XhrFailureReason = FetchInterceptorErrorReason;
type XhrTerminalEventType = XhrFailureReason | "load";
type XhrTerminalEvent = ProgressEvent<XMLHttpRequestEventTarget>;
type XhrTerminalHandler = (event: XhrTerminalEvent) => void;
type XhrTerminalHandlers = Record<XhrTerminalEventType, XhrTerminalHandler>;

function toRequestBody(body: Document | XMLHttpRequestBodyInit): BodyInit {
	if (typeof Document !== "undefined" && body instanceof Document) {
		return new XMLSerializer().serializeToString(body);
	}

	return body as BodyInit;
}

function cloneArrayBufferView(
	bufferView: ArrayBufferView<ArrayBufferLike>,
): Uint8Array<ArrayBuffer> {
	const copy = new Uint8Array(new ArrayBuffer(bufferView.byteLength));
	copy.set(
		new Uint8Array(
			bufferView.buffer,
			bufferView.byteOffset,
			bufferView.byteLength,
		),
	);
	return copy;
}

export function createXhrRequest(
	data: XhrInterceptorData,
	body?: Document | XMLHttpRequestBodyInit | null,
): Request {
	const requestInit: RequestInit = {
		method: data.method,
		headers: data.headers,
	};

	if (body != null && data.method !== "GET" && data.method !== "HEAD") {
		requestInit.body = toRequestBody(body);
	}

	return new Request(data.url, requestInit);
}

export function parseXhrResponseHeaders(rawHeaders: string): Headers {
	const headers = new Headers();
	const trimmedHeaders = rawHeaders.trim();

	if (!trimmedHeaders) {
		return headers;
	}

	for (const line of trimmedHeaders.split(/[\r\n]+/)) {
		const separatorIndex = line.indexOf(":");

		if (separatorIndex === -1) {
			continue;
		}

		const name = line.slice(0, separatorIndex).trim();
		const value = line.slice(separatorIndex + 1).trim();

		if (name) {
			headers.append(name, value);
		}
	}

	return headers;
}

function readXhrResponseText(xhr: XhrResponseSource): string | null {
	try {
		return xhr.responseText;
	} catch {
		return null;
	}
}

function toResponseBody(xhr: XhrResponseSource): BodyInit | null {
	const { response, responseType } = xhr;

	if (response == null) {
		return readXhrResponseText(xhr);
	}

	if (typeof response === "string") {
		return response;
	}

	if (typeof Blob !== "undefined" && response instanceof Blob) {
		return response;
	}

	if (response instanceof ArrayBuffer || ArrayBuffer.isView(response)) {
		return response instanceof ArrayBuffer
			? response
			: cloneArrayBufferView(response);
	}

	if (typeof Document !== "undefined" && response instanceof Document) {
		return new XMLSerializer().serializeToString(response);
	}

	if (responseType === "json") {
		return JSON.stringify(response);
	}

	return readXhrResponseText(xhr);
}

export function createXhrResponse(xhr: XhrResponseSource): Response {
	const responseBody = toResponseBody(xhr);

	return new Response(responseBody, {
		status: xhr.status,
		statusText: xhr.statusText,
		headers: parseXhrResponseHeaders(xhr.getAllResponseHeaders()),
	});
}

export function createXhrLoadHandler(
	xhr: XhrResponseSource,
	request: Request,
	options: RuntimeInterceptorOptions,
): () => void {
	return () => {
		if (!matchesRequestSafely(request, options.matcher)) {
			return;
		}

		runOnInterceptSafely(request, createXhrResponse(xhr), options.onIntercept);
	};
}

function createXhrInterceptorError(
	cause: XhrTerminalEvent,
	reason: XhrFailureReason,
): FetchInterceptorError {
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
	interceptionSnapshot: ReturnType<typeof createInterceptionSnapshot>,
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

/**
 * Intercepts XMLHttpRequest and returns a restore function.
 */
export function interceptXhr(
	getActiveInterceptors: () => RuntimeInterceptorOptions[],
): () => void {
	if (typeof XMLHttpRequest === "undefined") {
		return () => {};
	}

	const originalXhrOpen = XMLHttpRequest.prototype.open;
	const originalXhrOpenShort = originalXhrOpen as XhrOpenShort;
	const originalXhrOpenLong = originalXhrOpen as XhrOpenLong;
	const originalXhrSend = XMLHttpRequest.prototype.send;
	const originalXhrSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

	// Store metadata in a WeakMap keyed by each XHR instance.
	// Entries disappear with the instance, so this does not leak memory.
	const xhrDataMap = new WeakMap<XMLHttpRequest, XhrInterceptorData>();
	const xhrTerminalHandlersMap = new WeakMap<
		XMLHttpRequest,
		XhrTerminalHandlers
	>();

	XMLHttpRequest.prototype.open = function (
		method: string,
		url: string | URL,
		async?: boolean,
		username?: string | null,
		password?: string | null,
	) {
		xhrDataMap.set(this, {
			method: method.toUpperCase(),
			url: url.toString(),
			headers: new Headers(),
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

	XMLHttpRequest.prototype.setRequestHeader = function (
		...args: Parameters<XMLHttpRequest["setRequestHeader"]>
	) {
		const [name, value] = args;
		const data = xhrDataMap.get(this);

		if (data) {
			data.headers.append(name, value);
		}

		return originalXhrSetRequestHeader.apply(this, args);
	};

	XMLHttpRequest.prototype.send = function (
		...args: Parameters<XMLHttpRequest["send"]>
	) {
		const [body] = args;
		const data = xhrDataMap.get(this);

		detachXhrTerminalHandlers(this, xhrTerminalHandlersMap.get(this));
		xhrTerminalHandlersMap.delete(this);

		if (data) {
			const activeInterceptors = getActiveInterceptors();

			if (activeInterceptors.length > 0) {
				const request = createXhrRequest(data, body);
				const interceptionSnapshot = createInterceptionSnapshot(
					request,
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

	return function restoreXhr() {
		XMLHttpRequest.prototype.open = originalXhrOpen;
		XMLHttpRequest.prototype.send = originalXhrSend;
		XMLHttpRequest.prototype.setRequestHeader = originalXhrSetRequestHeader;
	};
}
