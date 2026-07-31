import { describe, expect, it, vi } from "vitest";

import { createFetchInterceptor } from "./index";
import {
	createDeferred,
	installBrowserTestHooks,
	useMockXmlHttpRequest,
} from "./index.test-support";

describe("createFetchInterceptor fetch behavior", () => {
	installBrowserTestHooks();

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

	it("matches the effective Request when fetch receives Request and init", async () => {
		const onIntercept = vi.fn();
		const originalFetch = vi.fn(async () => new Response("ok"));
		const baseRequest = new Request("https://example.com/base", {
			headers: {
				"x-original": "1",
			},
			method: "PUT",
		});

		globalThis.fetch = originalFetch as unknown as typeof fetch;
		useMockXmlHttpRequest();

		const interceptor = createFetchInterceptor({
			matcher: (request) => request.method === "POST",
			onIntercept,
		});

		interceptor.start();

		await fetch(baseRequest, {
			body: "override-body",
			headers: {
				"x-override": "1",
			},
			method: "POST",
		});

		expect(originalFetch).toHaveBeenCalledOnce();
		expect(onIntercept).toHaveBeenCalledOnce();

		const [request] = onIntercept.mock.calls[0];

		expect(request.method).toBe("POST");
		expect(request.headers.get("x-original")).toBeNull();
		expect(request.headers.get("x-override")).toBe("1");
		expect(await request.text()).toBe("override-body");
		expect(baseRequest.bodyUsed).toBe(false);

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

	it("preserves fetch responses when the matcher throws", async () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		const onIntercept = vi.fn();
		const originalFetch = vi.fn(async () => new Response("ok"));

		globalThis.fetch = originalFetch as unknown as typeof fetch;
		useMockXmlHttpRequest();

		const interceptor = createFetchInterceptor({
			matcher: () => {
				throw new Error("matcher failed");
			},
			onIntercept,
		});

		interceptor.start();

		const response = await fetch("https://example.com/matcher-error");

		expect(await response.text()).toBe("ok");
		expect(onIntercept).not.toHaveBeenCalled();
		expect(consoleError).toHaveBeenCalledOnce();

		interceptor.stop();
	});

	it.each([
		[
			"throws",
			() => {
				throw new Error("onIntercept failed");
			},
		],
		[
			"rejects",
			async () => {
				throw new Error("async onIntercept failed");
			},
		],
	] as const)("preserves fetch responses when onIntercept %s", async (_label, onIntercept) => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		const originalFetch = vi.fn(async () => new Response("ok"));

		globalThis.fetch = originalFetch as unknown as typeof fetch;
		useMockXmlHttpRequest();

		const interceptor = createFetchInterceptor({ onIntercept });

		interceptor.start();

		const response = await fetch("https://example.com/callback-error");
		await Promise.resolve();

		expect(await response.text()).toBe("ok");
		expect(consoleError).toHaveBeenCalledOnce();

		interceptor.stop();
	});

	it("preserves a successful fetch response when observation cannot clone it", async () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		const onIntercept = vi.fn();
		const onError = vi.fn();
		const consumedResponse = new Response("already consumed");

		await consumedResponse.text();

		const originalFetch = vi.fn(async () => consumedResponse);

		globalThis.fetch = originalFetch as unknown as typeof fetch;
		useMockXmlHttpRequest();

		const interceptor = createFetchInterceptor({
			onIntercept,
			onError,
		});

		interceptor.start();

		try {
			const response = await fetch("https://example.com/consumed-response");

			expect(response).toBe(consumedResponse);
			expect(onIntercept).not.toHaveBeenCalled();
			expect(onError).not.toHaveBeenCalled();
			expect(consoleError).toHaveBeenCalledOnce();
		} finally {
			interceptor.stop();
		}
	});

	it("preserves fetch results when request observation cannot clone the input", async () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		const onIntercept = vi.fn();
		const onError = vi.fn();
		const consumedRequest = new Request(
			"https://example.com/consumed-request",
			{
				body: "already consumed",
				method: "POST",
			},
		);

		await consumedRequest.text();

		const originalFetch = vi.fn(async () => new Response("ok"));

		globalThis.fetch = originalFetch as unknown as typeof fetch;
		useMockXmlHttpRequest();

		const interceptor = createFetchInterceptor({
			onIntercept,
			onError,
		});

		interceptor.start();

		try {
			const response = await fetch(consumedRequest);

			expect(await response.text()).toBe("ok");
			expect(originalFetch).toHaveBeenCalledWith(consumedRequest);
			expect(onIntercept).not.toHaveBeenCalled();
			expect(onError).not.toHaveBeenCalled();
			expect(consoleError).toHaveBeenCalledOnce();
		} finally {
			interceptor.stop();
		}
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

	it("classifies AbortError fetch rejections without replacing them", async () => {
		const abortError = new DOMException("aborted", "AbortError");
		const onError = vi.fn();
		const originalFetch = vi.fn(async () => {
			throw abortError;
		});

		globalThis.fetch = originalFetch as unknown as typeof fetch;
		useMockXmlHttpRequest();

		const interceptor = createFetchInterceptor({
			onIntercept: vi.fn(),
			onError,
		});

		interceptor.start();

		try {
			await expect(fetch("https://example.com/aborted")).rejects.toBe(
				abortError,
			);
			expect(onError).toHaveBeenCalledOnce();
			expect(onError.mock.calls[0]?.[1]).toMatchObject({
				cause: abortError,
				reason: "abort",
				transport: "fetch",
			});
		} finally {
			interceptor.stop();
		}
	});

	it("preserves arbitrary fetch rejections when error classification cannot inspect them", async () => {
		const classifierFailure = new Error("classifier failed");
		const networkFailure = new Proxy(
			{},
			{
				has() {
					throw classifierFailure;
				},
			},
		);
		const onError = vi.fn();
		const originalFetch = vi.fn(async () => {
			throw networkFailure;
		});

		globalThis.fetch = originalFetch as unknown as typeof fetch;
		useMockXmlHttpRequest();

		const interceptor = createFetchInterceptor({
			onIntercept: vi.fn(),
			onError,
		});

		interceptor.start();

		try {
			await expect(fetch("https://example.com/proxy-error")).rejects.toBe(
				networkFailure,
			);
			expect(onError).toHaveBeenCalledOnce();
			const normalizedError = onError.mock.calls[0]?.[1];
			expect(normalizedError?.cause).toBe(networkFailure);
			expect(normalizedError).toMatchObject({
				reason: "error",
				transport: "fetch",
			});
		} finally {
			interceptor.stop();
		}
	});

	it("preserves fetch rejection when onError rejects", async () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		const networkError = new TypeError("network failed");
		const originalFetch = vi.fn(async () => {
			throw networkError;
		});

		globalThis.fetch = originalFetch as unknown as typeof fetch;
		useMockXmlHttpRequest();

		const interceptor = createFetchInterceptor({
			onIntercept: vi.fn(),
			onError: async () => {
				throw new Error("onError failed");
			},
		});

		interceptor.start();

		await expect(fetch("https://example.com/on-error-failure")).rejects.toBe(
			networkError,
		);
		await Promise.resolve();

		expect(consoleError).toHaveBeenCalledOnce();

		interceptor.stop();
	});
});
