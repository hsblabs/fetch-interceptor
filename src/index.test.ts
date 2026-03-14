import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

import { createFetchInterceptor } from "./index";

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

function createDeferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});

	return { promise, resolve };
}

class MockXMLHttpRequest {
	static responses: MockXhrResponse[] = [];

	static reset() {
		MockXMLHttpRequest.responses = [];
	}

	static enqueueResponse(response: MockXhrResponse) {
		MockXMLHttpRequest.responses.push(response);
	}

	private listeners = new Map<
		string,
		Array<(event: ProgressEvent<XMLHttpRequest>) => void>
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
		listener: (event: ProgressEvent<XMLHttpRequest>) => void,
	) {
		const callbacks = this.listeners.get(type) ?? [];
		callbacks.push(listener);
		this.listeners.set(type, callbacks);
	}

	removeEventListener(
		type: string,
		listener: (event: ProgressEvent<XMLHttpRequest>) => void,
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
		} as ProgressEvent<XMLHttpRequest>;

		for (const listener of this.listeners.get(eventType) ?? []) {
			listener(event);
		}
	}
}

const nativeFetch = globalThis.fetch;
const nativeXmlHttpRequest = globalThis.XMLHttpRequest;

function useMockXmlHttpRequest() {
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

describe("createFetchInterceptor", () => {
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

	it("defaults matcher to true for fetch requests", async () => {
		const intercepted = createDeferred<{
			request: Request;
			response: Response;
		}>();
		const originalFetch = vi.fn(async () => {
			return new Response(JSON.stringify({ ok: true }), {
				headers: { "content-type": "application/json" },
				status: 201,
			});
		});

		globalThis.fetch = originalFetch as unknown as typeof fetch;
		useMockXmlHttpRequest();

		const interceptor = createFetchInterceptor({
			onIntercept: (request, response) =>
				intercepted.resolve({ request, response }),
		});

		interceptor.start();

		const response = await fetch("https://example.com/target", {
			body: JSON.stringify({ hello: "world" }),
			method: "POST",
		});
		const { request, response: interceptedResponse } =
			await intercepted.promise;

		expect(originalFetch).toHaveBeenCalledOnce();
		expect(await request.json()).toEqual({ hello: "world" });
		expect(interceptedResponse).not.toBe(response);
		expect(await interceptedResponse.json()).toEqual({ ok: true });
		expect(await response.json()).toEqual({ ok: true });

		interceptor.stop();
	});

	it("skips fetch callbacks when the matcher returns false", async () => {
		const onIntercept = vi.fn();
		const originalFetch = vi.fn(async () => new Response("ok"));

		globalThis.fetch = originalFetch as unknown as typeof fetch;
		useMockXmlHttpRequest();

		const interceptor = createFetchInterceptor({
			matcher: () => false,
			onIntercept,
		});

		interceptor.start();
		await fetch("https://example.com/ignored");

		expect(originalFetch).toHaveBeenCalledOnce();
		expect(onIntercept).not.toHaveBeenCalled();

		interceptor.stop();
	});

	it("defaults matcher to true for XMLHttpRequest calls", async () => {
		const intercepted = createDeferred<{
			request: Request;
			response: Response;
		}>();

		useMockXmlHttpRequest();
		MockXMLHttpRequest.enqueueResponse({
			body: JSON.stringify({ ok: true }),
			headers: {
				"content-type": "application/json",
				"x-request-id": "req-1",
			},
			status: 202,
			statusText: "Accepted",
		});

		const interceptor = createFetchInterceptor({
			onIntercept: (request, response) =>
				intercepted.resolve({ request, response }),
		});

		interceptor.start();

		const xhr = new XMLHttpRequest();
		xhr.open("post", "https://example.com/xhr");
		xhr.setRequestHeader("x-token", "secret");
		xhr.send(JSON.stringify({ hello: "world" }));

		const { request, response } = await intercepted.promise;

		expect(request.method).toBe("POST");
		expect(request.headers.get("x-token")).toBe("secret");
		expect(await request.json()).toEqual({ hello: "world" });
		expect(response.status).toBe(202);
		expect(response.statusText).toBe("Accepted");
		expect(response.headers.get("x-request-id")).toBe("req-1");
		expect(await response.json()).toEqual({ ok: true });

		interceptor.stop();
	});

	it("reports rejected fetch requests through onError and preserves the original rejection", async () => {
		const networkError = new TypeError("network failed");
		const onIntercept = vi.fn();
		const onError = vi.fn();
		const originalFetch = vi.fn(async () => {
			throw networkError;
		});

		globalThis.fetch = originalFetch as unknown as typeof fetch;
		useMockXmlHttpRequest();

		const interceptor = createFetchInterceptor({
			matcher: () => true,
			onIntercept,
			onError,
		});

		interceptor.start();

		await expect(fetch("https://example.com/fetch-failure")).rejects.toBe(
			networkError,
		);

		expect(onIntercept).not.toHaveBeenCalled();
		expect(onError).toHaveBeenCalledOnce();

		const [request, error] = onError.mock.calls[0];

		expect(request.url).toBe("https://example.com/fetch-failure");
		expect(error).toMatchObject({
			cause: networkError,
			reason: "error",
			transport: "fetch",
		});

		interceptor.stop();
	});

	it.each([
		["error"],
		["abort"],
		["timeout"],
	] as const)("reports XMLHttpRequest %s events through onError", (eventType) => {
		const onIntercept = vi.fn();
		const onError = vi.fn();

		useMockXmlHttpRequest();
		MockXMLHttpRequest.enqueueResponse({ eventType });

		const interceptor = createFetchInterceptor({
			onIntercept,
			onError,
		});

		interceptor.start();

		const xhr = new XMLHttpRequest();
		xhr.open("POST", "https://example.com/xhr-failure");
		xhr.send(JSON.stringify({ hello: "world" }));

		expect(onIntercept).not.toHaveBeenCalled();
		expect(onError).toHaveBeenCalledOnce();

		const [request, error] = onError.mock.calls[0];

		expect(request.method).toBe("POST");
		expect(request.url).toBe("https://example.com/xhr-failure");
		expect(error).toMatchObject({
			reason: eventType,
			transport: "xhr",
		});
		expect(error.cause).toMatchObject({
			type: eventType,
		});

		interceptor.stop();
	});

	it("does not leak XMLHttpRequest terminal handlers across repeated sends", () => {
		const seenUrls: string[] = [];

		useMockXmlHttpRequest();
		MockXMLHttpRequest.enqueueResponse({ body: "first" });
		MockXMLHttpRequest.enqueueResponse({ body: "second" });

		const interceptor = createFetchInterceptor({
			onIntercept: (request) => seenUrls.push(request.url),
		});

		interceptor.start();

		const xhr = new XMLHttpRequest();
		xhr.open("GET", "https://example.com/first");
		xhr.send();
		xhr.open("GET", "https://example.com/second");
		xhr.send();

		expect(seenUrls).toEqual([
			"https://example.com/first",
			"https://example.com/second",
		]);

		interceptor.stop();
	});

	it("normalizes JSON XMLHttpRequest responses into a readable Response body", async () => {
		const intercepted = createDeferred<{
			request: Request;
			response: Response;
		}>();

		useMockXmlHttpRequest();
		MockXMLHttpRequest.enqueueResponse({
			headers: {
				"content-type": "application/json",
			},
			response: { ok: true, version: 1 },
		});

		const interceptor = createFetchInterceptor({
			onIntercept: (request, response) =>
				intercepted.resolve({ request, response }),
		});

		interceptor.start();

		const xhr = new XMLHttpRequest();
		xhr.open("GET", "https://example.com/xhr-json");
		xhr.responseType = "json";
		xhr.send();

		const { request, response } = await intercepted.promise;

		expect(request.url).toBe("https://example.com/xhr-json");
		expect(await response.json()).toEqual({ ok: true, version: 1 });

		interceptor.stop();
	});

	it("starts only once and restores the original globals on stop", async () => {
		const onIntercept = vi.fn();
		const originalFetch = vi.fn(async () => new Response("ok"));

		globalThis.fetch = originalFetch as unknown as typeof fetch;
		useMockXmlHttpRequest();

		const originalXhrOpen = XMLHttpRequest.prototype.open;
		const originalXhrSend = XMLHttpRequest.prototype.send;
		const originalXhrSetRequestHeader =
			XMLHttpRequest.prototype.setRequestHeader;
		const interceptor = createFetchInterceptor({
			matcher: () => true,
			onIntercept,
		});

		interceptor.start();

		const patchedFetch = globalThis.fetch;
		const patchedXhrOpen = XMLHttpRequest.prototype.open;

		interceptor.start();
		await fetch("https://example.com/lifecycle");

		expect(globalThis.fetch).toBe(patchedFetch);
		expect(XMLHttpRequest.prototype.open).toBe(patchedXhrOpen);
		expect(onIntercept).toHaveBeenCalledTimes(1);

		interceptor.stop();

		expect(globalThis.fetch).toBe(originalFetch);
		expect(XMLHttpRequest.prototype.open).toBe(originalXhrOpen);
		expect(XMLHttpRequest.prototype.send).toBe(originalXhrSend);
		expect(XMLHttpRequest.prototype.setRequestHeader).toBe(
			originalXhrSetRequestHeader,
		);
		expect(() => interceptor.stop()).not.toThrow();

		await fetch("https://example.com/after-stop");

		expect(onIntercept).toHaveBeenCalledTimes(1);
	});

	it("keeps remaining interceptors active until the last one stops", async () => {
		const originalFetch = vi.fn(async () => new Response("ok"));
		const seenByA: string[] = [];
		const seenByB: string[] = [];

		globalThis.fetch = originalFetch as unknown as typeof fetch;
		useMockXmlHttpRequest();

		const originalXhrOpen = XMLHttpRequest.prototype.open;
		const originalXhrSend = XMLHttpRequest.prototype.send;
		const originalXhrSetRequestHeader =
			XMLHttpRequest.prototype.setRequestHeader;
		const interceptorA = createFetchInterceptor({
			onIntercept: (request) => seenByA.push(new URL(request.url).pathname),
		});
		const interceptorB = createFetchInterceptor({
			onIntercept: (request) => seenByB.push(new URL(request.url).pathname),
		});

		interceptorA.start();
		interceptorB.start();

		await fetch("https://example.com/both-fetch");

		MockXMLHttpRequest.enqueueResponse({ body: "ok" });

		const firstXhr = new XMLHttpRequest();
		firstXhr.open("GET", "https://example.com/both-xhr");
		firstXhr.send();

		expect(seenByA).toEqual(["/both-fetch", "/both-xhr"]);
		expect(seenByB).toEqual(["/both-fetch", "/both-xhr"]);

		interceptorA.stop();

		expect(globalThis.fetch).not.toBe(originalFetch);
		expect(XMLHttpRequest.prototype.open).not.toBe(originalXhrOpen);
		expect(XMLHttpRequest.prototype.send).not.toBe(originalXhrSend);
		expect(XMLHttpRequest.prototype.setRequestHeader).not.toBe(
			originalXhrSetRequestHeader,
		);

		await fetch("https://example.com/after-a-stop-fetch");

		MockXMLHttpRequest.enqueueResponse({ body: "ok" });

		const secondXhr = new XMLHttpRequest();
		secondXhr.open("GET", "https://example.com/after-a-stop-xhr");
		secondXhr.send();

		expect(seenByA).toEqual(["/both-fetch", "/both-xhr"]);
		expect(seenByB).toEqual([
			"/both-fetch",
			"/both-xhr",
			"/after-a-stop-fetch",
			"/after-a-stop-xhr",
		]);

		interceptorB.stop();

		expect(globalThis.fetch).toBe(originalFetch);
		expect(XMLHttpRequest.prototype.open).toBe(originalXhrOpen);
		expect(XMLHttpRequest.prototype.send).toBe(originalXhrSend);
		expect(XMLHttpRequest.prototype.setRequestHeader).toBe(
			originalXhrSetRequestHeader,
		);
	});

	it("snapshots active fetch interceptors when a request starts", async () => {
		const originalFetch = vi.fn(async () => {
			return deferredResponse.promise;
		});
		const deferredResponse = createDeferred<Response>();
		const seenByA: string[] = [];
		const seenByB: string[] = [];

		globalThis.fetch = originalFetch as unknown as typeof fetch;
		useMockXmlHttpRequest();

		const interceptorA = createFetchInterceptor({
			onIntercept: (request) => seenByA.push(request.url),
		});
		const interceptorB = createFetchInterceptor({
			onIntercept: (request) => seenByB.push(request.url),
		});

		interceptorA.start();

		const responsePromise = fetch("https://example.com/in-flight");

		interceptorB.start();
		interceptorA.stop();

		deferredResponse.resolve(new Response("ok"));

		await responsePromise;

		expect(seenByA).toEqual(["https://example.com/in-flight"]);
		expect(seenByB).toEqual([]);

		interceptorB.stop();
	});
});
