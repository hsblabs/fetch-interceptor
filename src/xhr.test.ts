import { afterEach, describe, expect, it, vi } from "vitest";

import {
	createXhrLoadHandler,
	createXhrRequest,
	createXhrResponse,
	parseXhrResponseHeaders,
} from "./xhr";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("createXhrRequest", () => {
	it("keeps request bodies for non-GET methods, including empty strings", async () => {
		const request = createXhrRequest(
			{
				headers: new Headers({ "content-type": "text/plain" }),
				method: "POST",
				url: "https://example.com/body",
			},
			"",
		);

		expect(request.method).toBe("POST");
		expect(request.headers.get("content-type")).toBe("text/plain");
		expect(await request.text()).toBe("");
	});

	it("omits request bodies for GET requests", async () => {
		const request = createXhrRequest(
			{
				headers: new Headers(),
				method: "GET",
				url: "https://example.com/no-body",
			},
			"ignored",
		);

		expect(request.method).toBe("GET");
		expect(await request.text()).toBe("");
	});
});

describe("parseXhrResponseHeaders", () => {
	it("parses raw header strings and preserves colons in values", () => {
		const headers = parseXhrResponseHeaders(
			"content-type: application/json\r\nx-trace: foo:bar:baz\r\ninvalid-header",
		);

		expect(headers.get("content-type")).toBe("application/json");
		expect(headers.get("x-trace")).toBe("foo:bar:baz");
	});

	it("returns empty headers for blank input", () => {
		const headers = parseXhrResponseHeaders("   ");

		expect(Array.from(headers.entries())).toEqual([]);
	});
});

describe("createXhrResponse", () => {
	it("builds a Response from xhr state", async () => {
		const response = createXhrResponse({
			getAllResponseHeaders: () =>
				"content-type: application/json\r\nx-request-id: req-1",
			response: JSON.stringify({ ok: true }),
			responseText: "fallback",
			status: 202,
			statusText: "Accepted",
		});

		expect(response.status).toBe(202);
		expect(response.statusText).toBe("Accepted");
		expect(response.headers.get("x-request-id")).toBe("req-1");
		expect(await response.json()).toEqual({ ok: true });
	});
});

describe("createXhrLoadHandler", () => {
	it("invokes onIntercept when matcher returns true", async () => {
		const onIntercept = vi.fn();
		const request = new Request("https://example.com/xhr", {
			method: "POST",
		});
		const handleLoad = createXhrLoadHandler(
			{
				getAllResponseHeaders: () => "content-type: text/plain",
				response: "ok",
				responseText: "fallback",
				status: 200,
				statusText: "OK",
			},
			request,
			{
				matcher: () => true,
				onIntercept,
			},
		);

		handleLoad();

		expect(onIntercept).toHaveBeenCalledOnce();

		const [interceptedRequest, response] = onIntercept.mock.calls[0];

		expect(interceptedRequest).toBe(request);
		expect(await response.text()).toBe("ok");
	});

	it("skips onIntercept when matcher returns false", () => {
		const onIntercept = vi.fn();
		const handleLoad = createXhrLoadHandler(
			{
				getAllResponseHeaders: () => "",
				response: null,
				responseText: "",
				status: 204,
				statusText: "No Content",
			},
			new Request("https://example.com/xhr"),
			{
				matcher: () => false,
				onIntercept,
			},
		);

		handleLoad();

		expect(onIntercept).not.toHaveBeenCalled();
	});

	it("reports matcher errors without throwing", () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		const onIntercept = vi.fn();
		const handleLoad = createXhrLoadHandler(
			{
				getAllResponseHeaders: () => "",
				response: "ok",
				responseText: "ok",
				status: 200,
				statusText: "OK",
			},
			new Request("https://example.com/xhr"),
			{
				matcher: () => {
					throw new Error("matcher failed");
				},
				onIntercept,
			},
		);

		expect(() => handleLoad()).not.toThrow();
		expect(onIntercept).not.toHaveBeenCalled();
		expect(consoleError).toHaveBeenCalledOnce();
	});

	it("reports rejected async onIntercept callbacks without throwing", async () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		const handleLoad = createXhrLoadHandler(
			{
				getAllResponseHeaders: () => "",
				response: "ok",
				responseText: "ok",
				status: 200,
				statusText: "OK",
			},
			new Request("https://example.com/xhr"),
			{
				matcher: () => true,
				onIntercept: async () => {
					throw new Error("async onIntercept failed");
				},
			},
		);

		expect(() => handleLoad()).not.toThrow();

		await Promise.resolve();

		expect(consoleError).toHaveBeenCalledOnce();
	});
});
