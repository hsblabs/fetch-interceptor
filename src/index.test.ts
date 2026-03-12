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
	headers?: Record<string, string>;
	response?: XMLHttpRequest["response"];
	responseText?: string;
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

	private listeners = new Map<string, Array<() => void>>();
	private rawResponseHeaders = "";

	status = 0;
	statusText = "";
	response: XMLHttpRequest["response"] = null;
	responseText = "";

	open(_method: string, _url: string | URL, ..._args: unknown[]) {}

	setRequestHeader(_name: string, _value: string) {}

	addEventListener(type: string, listener: () => void) {
		const callbacks = this.listeners.get(type) ?? [];
		callbacks.push(listener);
		this.listeners.set(type, callbacks);
	}

	getAllResponseHeaders() {
		return this.rawResponseHeaders;
	}

	send(_body?: Document | XMLHttpRequestBodyInit | null) {
		const nextResponse = MockXMLHttpRequest.responses.shift() ?? {};

		this.status = nextResponse.status ?? 200;
		this.statusText = nextResponse.statusText ?? "OK";
		this.response = nextResponse.response ?? nextResponse.body ?? null;
		this.responseText =
			nextResponse.responseText ??
			(typeof nextResponse.body === "string" ? nextResponse.body : "");
		this.rawResponseHeaders = Object.entries(nextResponse.headers ?? {})
			.map(([name, value]) => `${name}: ${value}`)
			.join("\r\n");

		for (const listener of this.listeners.get("load") ?? []) {
			listener();
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
});
