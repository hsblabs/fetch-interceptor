import { afterAll, afterEach, beforeEach, vi } from "vitest";

type Deferred<T> = {
	promise: Promise<T>;
	resolve: (value: T) => void;
};

type MockXhrResponse = {
	body?: BodyInit | null;
	eventType?: "abort" | "error" | "load" | "timeout";
	headers?: Record<string, string>;
	response?: XMLHttpRequest["response"];
	responseText?: string;
	responseType?: XMLHttpRequestResponseType;
	status?: number;
	statusText?: string;
};

export function createDeferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise;
	});

	return { promise, resolve };
}

export class MockXMLHttpRequest {
	static responses: MockXhrResponse[] = [];

	static reset() {
		MockXMLHttpRequest.responses = [];
	}

	static enqueueResponse(response: MockXhrResponse) {
		MockXMLHttpRequest.responses.push(response);
	}

	private listeners = new Map<
		string,
		Array<(event: ProgressEvent<XMLHttpRequestEventTarget>) => void>
	>();
	private rawResponseHeaders = "";

	status = 0;
	statusText = "";
	response: XMLHttpRequest["response"] = null;
	responseType: XMLHttpRequestResponseType = "";
	responseText = "";

	open(_method: string, _url: string | URL, ..._args: unknown[]) {}

	setRequestHeader(_name: string, _value: string) {}

	addEventListener(
		type: string,
		listener: (event: ProgressEvent<XMLHttpRequestEventTarget>) => void,
	) {
		const callbacks = this.listeners.get(type) ?? [];
		callbacks.push(listener);
		this.listeners.set(type, callbacks);
	}

	removeEventListener(
		type: string,
		listener: (event: ProgressEvent<XMLHttpRequestEventTarget>) => void,
	) {
		const callbacks = this.listeners.get(type) ?? [];
		this.listeners.set(
			type,
			callbacks.filter((callback) => callback !== listener),
		);
	}

	getAllResponseHeaders() {
		return this.rawResponseHeaders;
	}

	send(_body?: Document | XMLHttpRequestBodyInit | null) {
		const nextResponse = MockXMLHttpRequest.responses.shift() ?? {};
		const eventType = nextResponse.eventType ?? "load";

		this.status = nextResponse.status ?? 200;
		this.statusText = nextResponse.statusText ?? "OK";
		this.response = nextResponse.response ?? nextResponse.body ?? null;
		this.responseType = nextResponse.responseType ?? this.responseType;
		this.responseText =
			nextResponse.responseText ??
			(typeof nextResponse.body === "string" ? nextResponse.body : "");
		this.rawResponseHeaders = Object.entries(nextResponse.headers ?? {})
			.map(([name, value]) => `${name}: ${value}`)
			.join("\r\n");

		const event = {
			currentTarget: this,
			target: this,
			type: eventType,
		} as unknown as ProgressEvent<XMLHttpRequestEventTarget>;

		for (const listener of this.listeners.get(eventType) ?? []) {
			listener(event);
		}
	}
}

const nativeFetch = globalThis.fetch;
const nativeXmlHttpRequest = globalThis.XMLHttpRequest;

export function useMockXmlHttpRequest() {
	globalThis.XMLHttpRequest =
		MockXMLHttpRequest as unknown as typeof XMLHttpRequest;
}

function restoreBrowserGlobals() {
	globalThis.fetch = nativeFetch;

	if (nativeXmlHttpRequest) {
		globalThis.XMLHttpRequest = nativeXmlHttpRequest;
		return;
	}

	Reflect.deleteProperty(globalThis, "XMLHttpRequest");
}

export function installBrowserTestHooks() {
	beforeEach(() => {
		vi.restoreAllMocks();
		MockXMLHttpRequest.reset();
		restoreBrowserGlobals();
	});

	afterEach(() => {
		restoreBrowserGlobals();
	});

	afterAll(() => {
		restoreBrowserGlobals();
	});
}
