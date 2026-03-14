import { matchesRequestSafely, runOnInterceptSafely } from "./callbacks";
import type { RuntimeInterceptorOptions } from "./types";

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
	| "responseText"
	| "status"
	| "statusText"
>;

type XhrInterceptionSnapshot = Array<{
	onIntercept: RuntimeInterceptorOptions["onIntercept"];
	request: Request;
}>;

function toRequestBody(body: Document | XMLHttpRequestBodyInit): BodyInit {
	if (typeof Document !== "undefined" && body instanceof Document) {
		return new XMLSerializer().serializeToString(body);
	}

	return body as BodyInit;
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

export function createXhrResponse(xhr: XhrResponseSource): Response {
	const responseBody = xhr.response ?? xhr.responseText;

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

function createXhrInterceptionSnapshot(
	request: Request,
	interceptors: RuntimeInterceptorOptions[],
): XhrInterceptionSnapshot {
	const snapshot: XhrInterceptionSnapshot = [];

	for (const interceptor of interceptors) {
		const interceptedRequest = request.clone();

		if (matchesRequestSafely(interceptedRequest, interceptor.matcher)) {
			snapshot.push({
				request: interceptedRequest,
				onIntercept: interceptor.onIntercept,
			});
		}
	}

	return snapshot;
}

function createSharedXhrLoadHandler(
	xhr: XhrResponseSource,
	interceptionSnapshot: XhrInterceptionSnapshot,
): () => void {
	return () => {
		if (interceptionSnapshot.length === 0) {
			return;
		}

		const response = createXhrResponse(xhr);

		for (const interceptor of interceptionSnapshot) {
			runOnInterceptSafely(
				interceptor.request,
				response.clone(),
				interceptor.onIntercept,
			);
		}
	};
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

	XMLHttpRequest.prototype.open = function (
		method: string,
		url: string | URL,
		async?: boolean,
		username?: string | null,
		password?: string | null,
	) {
		// Save state using the current XHR instance as the key.
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

		// Only run interception logic when metadata exists in the WeakMap.
		if (data) {
			const activeInterceptors = getActiveInterceptors();

			if (activeInterceptors.length > 0) {
				const request = createXhrRequest(data, body);
				const interceptionSnapshot = createXhrInterceptionSnapshot(
					request,
					activeInterceptors,
				);

				if (interceptionSnapshot.length > 0) {
					this.addEventListener(
						"load",
						createSharedXhrLoadHandler(this, interceptionSnapshot),
					);
				}
			}
		}

		return originalXhrSend.apply(this, args);
	};

	// Return a cleanup function.
	return function restoreXhr() {
		XMLHttpRequest.prototype.open = originalXhrOpen;
		XMLHttpRequest.prototype.send = originalXhrSend;
		XMLHttpRequest.prototype.setRequestHeader = originalXhrSetRequestHeader;
	};
}
