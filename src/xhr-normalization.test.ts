import { describe, expect, it } from "vitest";

import {
	createXhrRequest,
	createXhrResponse,
	parseXhrResponseHeaders,
} from "./xhr-normalization";

describe("createXhrRequest", () => {
	it("keeps request bodies for non-GET methods, including empty strings", async () => {
		const request = createXhrRequest(
			{
				headers: [["content-type", "text/plain"]],
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
				headers: [],
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
			responseType: "",
			responseText: "fallback",
			status: 202,
			statusText: "Accepted",
		});

		expect(response.status).toBe(202);
		expect(response.statusText).toBe("Accepted");
		expect(response.headers.get("x-request-id")).toBe("req-1");
		expect(await response.json()).toEqual({ ok: true });
	});

	it("serializes JSON response objects before constructing the Response", async () => {
		const response = createXhrResponse({
			getAllResponseHeaders: () => "content-type: application/json",
			response: { nested: { ok: true } },
			responseType: "json",
			responseText: "",
			status: 200,
			statusText: "OK",
		});

		expect(await response.json()).toEqual({ nested: { ok: true } });
	});

	it("treats unreadable responseText as an empty body", async () => {
		const response = createXhrResponse({
			getAllResponseHeaders: () => "",
			response: null,
			responseType: "json",
			get responseText() {
				throw new Error("InvalidStateError");
			},
			status: 200,
			statusText: "OK",
		});

		expect(await response.text()).toBe("");
	});

	it.each([
		204, 205, 304,
	])("omits the body for HTTP status %s", async (status) => {
		const response = createXhrResponse({
			getAllResponseHeaders: () => "content-type: text/plain",
			response: "",
			responseType: "",
			responseText: "",
			status,
			statusText: "No Body",
		});

		expect(response.status).toBe(status);
		expect(await response.text()).toBe("");
	});

	it("represents XHR status 0 with Response.error", async () => {
		const response = createXhrResponse({
			getAllResponseHeaders: () => "content-type: text/plain",
			response: "local response",
			responseType: "",
			responseText: "local response",
			status: 0,
			statusText: "",
		});

		expect(response.status).toBe(0);
		expect(response.type).toBe("error");
		expect(await response.text()).toBe("");
	});
});
