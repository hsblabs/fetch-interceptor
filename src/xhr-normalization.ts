export type XhrRequestMetadata = Readonly<{
	method: string;
	url: string;
	headers: Headers;
}>;

type XhrResponseSource = Pick<
	XMLHttpRequest,
	| "getAllResponseHeaders"
	| "response"
	| "responseType"
	| "responseText"
	| "status"
	| "statusText"
>;

const nullBodyStatusCodes: ReadonlySet<number> = new Set([204, 205, 304]);

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
	metadata: XhrRequestMetadata,
	body?: Document | XMLHttpRequestBodyInit | null,
): Request {
	const requestInit: RequestInit = {
		method: metadata.method,
		headers: metadata.headers,
	};

	if (body != null && metadata.method !== "GET" && metadata.method !== "HEAD") {
		requestInit.body = toRequestBody(body);
	}

	return new Request(metadata.url, requestInit);
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
	if (xhr.status === 0) {
		// Response.error() is the only standard Response representation with status 0.
		return Response.error();
	}

	const responseBody = nullBodyStatusCodes.has(xhr.status)
		? null
		: toResponseBody(xhr);

	return new Response(responseBody, {
		status: xhr.status,
		statusText: xhr.statusText,
		headers: parseXhrResponseHeaders(xhr.getAllResponseHeaders()),
	});
}
