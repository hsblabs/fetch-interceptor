import { describe, expect, it, vi } from "vitest";

import { createFetchInterceptorHandler, createFetchRequest } from "./fetch";

describe("createFetchRequest", () => {
	it("clones Request inputs", async () => {
		const originalRequest = new Request("https://example.com/clone", {
			body: "hello",
			method: "POST",
		});

		const clonedRequest = createFetchRequest(originalRequest);

		await originalRequest.text();

		expect(clonedRequest).not.toBe(originalRequest);
		expect(await clonedRequest.text()).toBe("hello");
	});

	it("creates a Request from fetch arguments", async () => {
		const request = createFetchRequest("https://example.com/from-args", {
			body: JSON.stringify({ hello: "world" }),
			headers: { "content-type": "application/json" },
			method: "PUT",
		});

		expect(request.method).toBe("PUT");
		expect(request.headers.get("content-type")).toBe("application/json");
		expect(await request.json()).toEqual({ hello: "world" });
	});
});

describe("createFetchInterceptorHandler", () => {
	it("intercepts matching requests with a cloned response", async () => {
		const onIntercept = vi.fn();
		const originalFetch = vi.fn(async () => {
			return new Response(JSON.stringify({ ok: true }), {
				headers: { "content-type": "application/json" },
			});
		});
		const interceptedFetch = createFetchInterceptorHandler(originalFetch, {
			matcher: (request) => request.url === "https://example.com/target",
			onIntercept,
		});

		const response = await interceptedFetch("https://example.com/target");

		expect(originalFetch).toHaveBeenCalledOnce();
		expect(onIntercept).toHaveBeenCalledOnce();

		const [request, interceptedResponse] = onIntercept.mock.calls[0];

		expect(request.url).toBe("https://example.com/target");
		expect(interceptedResponse).not.toBe(response);
		expect(await interceptedResponse.json()).toEqual({ ok: true });
		expect(await response.json()).toEqual({ ok: true });
	});

	it("skips onIntercept when matcher returns false", async () => {
		const onIntercept = vi.fn();
		const originalFetch = vi.fn(async () => new Response("ok"));
		const interceptedFetch = createFetchInterceptorHandler(originalFetch, {
			matcher: () => false,
			onIntercept,
		});

		await interceptedFetch("https://example.com/ignored");

		expect(originalFetch).toHaveBeenCalledOnce();
		expect(onIntercept).not.toHaveBeenCalled();
	});
});
