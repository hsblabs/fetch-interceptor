import { describe, expect, it } from "vitest";

import { createFetchRequest } from "./fetch";

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

	it("applies init overrides without consuming the original body", async () => {
		const originalRequest = new Request("https://example.com/base", {
			body: "original-body",
			headers: {
				"x-original": "1",
			},
			method: "POST",
		});

		const request = createFetchRequest(originalRequest, {
			body: "override-body",
			headers: {
				"x-override": "1",
			},
			method: "PUT",
		});

		expect(request.method).toBe("PUT");
		expect(request.headers.get("x-original")).toBeNull();
		expect(request.headers.get("x-override")).toBe("1");
		expect(await request.text()).toBe("override-body");
		expect(originalRequest.bodyUsed).toBe(false);
		expect(await originalRequest.text()).toBe("original-body");
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
