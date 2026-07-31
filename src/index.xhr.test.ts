import { describe, expect, it, vi } from "vitest";

import { createFetchInterceptor } from "./index";
import {
	createDeferred,
	installBrowserTestHooks,
	MockXMLHttpRequest,
	useMockXmlHttpRequest,
} from "./index.test-support";

describe("createFetchInterceptor XMLHttpRequest behavior", () => {
	installBrowserTestHooks();

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

	it("skips XMLHttpRequest callbacks when the matcher returns false", () => {
		const onIntercept = vi.fn();

		useMockXmlHttpRequest();
		MockXMLHttpRequest.enqueueResponse({ body: "ignored" });

		const interceptor = createFetchInterceptor({
			matcher: () => false,
			onIntercept,
		});

		interceptor.start();

		const xhr = new XMLHttpRequest();
		xhr.open("GET", "https://example.com/ignored-xhr");
		xhr.send();

		expect(onIntercept).not.toHaveBeenCalled();

		interceptor.stop();
	});

	it("preserves XMLHttpRequest results when the matcher throws", () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		const onIntercept = vi.fn();

		useMockXmlHttpRequest();
		MockXMLHttpRequest.enqueueResponse({ body: "ok" });

		const interceptor = createFetchInterceptor({
			matcher: () => {
				throw new Error("matcher failed");
			},
			onIntercept,
		});

		interceptor.start();

		const xhr = new XMLHttpRequest();
		xhr.open("GET", "https://example.com/xhr-matcher-error");
		expect(() => xhr.send()).not.toThrow();

		expect(onIntercept).not.toHaveBeenCalled();
		expect(consoleError).toHaveBeenCalledOnce();

		interceptor.stop();
	});

	it("preserves XMLHttpRequest results when request observation fails", () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		const onIntercept = vi.fn();
		const onError = vi.fn();

		useMockXmlHttpRequest();
		MockXMLHttpRequest.enqueueResponse({ body: "ok" });

		const interceptor = createFetchInterceptor({
			onIntercept,
			onError,
		});

		interceptor.start();

		try {
			const xhr = new XMLHttpRequest();
			xhr.open("GET", "http://[invalid-url");
			expect(() => xhr.send()).not.toThrow();

			expect(onIntercept).not.toHaveBeenCalled();
			expect(onError).not.toHaveBeenCalled();
			expect(consoleError).toHaveBeenCalledOnce();
		} finally {
			interceptor.stop();
		}
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

	it.each([
		204, 205, 304,
	])("normalizes XMLHttpRequest status %s without a response body", async (status) => {
		const intercepted = createDeferred<Response>();

		useMockXmlHttpRequest();
		MockXMLHttpRequest.enqueueResponse({
			body: "",
			status,
			statusText: "No Body",
		});

		const interceptor = createFetchInterceptor({
			onIntercept: (_request, response) => intercepted.resolve(response),
		});

		interceptor.start();

		try {
			const xhr = new XMLHttpRequest();
			xhr.open("GET", `https://example.com/status-${status}`);
			xhr.send();

			const response = await intercepted.promise;

			expect(response.status).toBe(status);
			expect(await response.text()).toBe("");
		} finally {
			interceptor.stop();
		}
	});

	it("represents XMLHttpRequest status 0 as a standard error Response", async () => {
		const intercepted = createDeferred<Response>();

		useMockXmlHttpRequest();
		MockXMLHttpRequest.enqueueResponse({
			body: "local response",
			status: 0,
			statusText: "",
		});

		const interceptor = createFetchInterceptor({
			onIntercept: (_request, response) => intercepted.resolve(response),
		});

		interceptor.start();

		try {
			const xhr = new XMLHttpRequest();
			xhr.open("GET", "file:///status-zero");
			xhr.send();

			const response = await intercepted.promise;

			expect(response.status).toBe(0);
			expect(response.type).toBe("error");
			expect(await response.text()).toBe("");
		} finally {
			interceptor.stop();
		}
	});

	it("preserves XMLHttpRequest results when response normalization fails", () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		const onIntercept = vi.fn();
		const onError = vi.fn();

		useMockXmlHttpRequest();
		MockXMLHttpRequest.enqueueResponse({
			body: "unsupported status",
			status: 199,
			statusText: "Unsupported",
		});

		const interceptor = createFetchInterceptor({
			onIntercept,
			onError,
		});

		interceptor.start();

		try {
			const xhr = new XMLHttpRequest();
			xhr.open("GET", "https://example.com/unsupported-status");
			expect(() => xhr.send()).not.toThrow();

			expect(onIntercept).not.toHaveBeenCalled();
			expect(onError).not.toHaveBeenCalled();
			expect(consoleError).toHaveBeenCalledOnce();
		} finally {
			interceptor.stop();
		}
	});
});
