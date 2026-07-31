import { describe, expect, it, vi } from "vitest";

import { createFetchInterceptor } from "./index";
import {
	createDeferred,
	installBrowserTestHooks,
	MockXMLHttpRequest,
	useMockXmlHttpRequest,
} from "./index.test-support";

describe("createFetchInterceptor lifecycle", () => {
	installBrowserTestHooks();

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

	it.each([
		"open",
		"setRequestHeader",
		"send",
	] as const)("rolls back installation when XMLHttpRequest.%s cannot be patched", (nonPatchableMethod) => {
		class NonPatchableXMLHttpRequest extends MockXMLHttpRequest {}

		Object.defineProperty(
			NonPatchableXMLHttpRequest.prototype,
			nonPatchableMethod,
			{
				configurable: true,
				value: MockXMLHttpRequest.prototype[nonPatchableMethod],
				writable: false,
			},
		);

		const originalFetch = vi.fn(async () => new Response("ok"));
		globalThis.fetch = originalFetch as unknown as typeof fetch;
		globalThis.XMLHttpRequest =
			NonPatchableXMLHttpRequest as unknown as typeof XMLHttpRequest;

		const interceptor = createFetchInterceptor({
			onIntercept: vi.fn(),
		});

		try {
			expect(() => interceptor.start()).toThrow();
			expect(globalThis.fetch).toBe(originalFetch);
			expect(NonPatchableXMLHttpRequest.prototype.open).toBe(
				MockXMLHttpRequest.prototype.open,
			);
			expect(NonPatchableXMLHttpRequest.prototype.setRequestHeader).toBe(
				MockXMLHttpRequest.prototype.setRequestHeader,
			);
			expect(NonPatchableXMLHttpRequest.prototype.send).toBe(
				MockXMLHttpRequest.prototype.send,
			);
			expect(() => interceptor.start()).toThrow();
		} finally {
			interceptor.stop();
		}
	});

	it("retries failed fetch restoration without stacking interception", async () => {
		const originalFetch = vi.fn(async () => new Response("ok"));
		const onIntercept = vi.fn();
		globalThis.fetch = originalFetch as unknown as typeof fetch;
		useMockXmlHttpRequest();

		const originalXhrOpen = XMLHttpRequest.prototype.open;
		const originalXhrSend = XMLHttpRequest.prototype.send;
		const originalXhrSetRequestHeader =
			XMLHttpRequest.prototype.setRequestHeader;
		const interceptor = createFetchInterceptor({
			onIntercept,
		});

		interceptor.start();
		const installedFetch = globalThis.fetch;

		Object.defineProperty(globalThis, "fetch", {
			configurable: true,
			value: installedFetch,
			writable: false,
		});

		try {
			expect(() => interceptor.stop()).toThrow();
			expect(globalThis.fetch).toBe(installedFetch);
			expect(XMLHttpRequest.prototype.open).toBe(originalXhrOpen);
			expect(XMLHttpRequest.prototype.send).toBe(originalXhrSend);
			expect(XMLHttpRequest.prototype.setRequestHeader).toBe(
				originalXhrSetRequestHeader,
			);

			Object.defineProperty(globalThis, "fetch", {
				configurable: true,
				value: installedFetch,
				writable: true,
			});

			expect(() => interceptor.stop()).not.toThrow();
			expect(globalThis.fetch).toBe(originalFetch);

			interceptor.start();
			await fetch("https://example.com/restarted");
			expect(onIntercept).toHaveBeenCalledOnce();
			interceptor.stop();
		} finally {
			Object.defineProperty(globalThis, "fetch", {
				configurable: true,
				value: originalFetch,
				writable: true,
			});
			XMLHttpRequest.prototype.open = originalXhrOpen;
			XMLHttpRequest.prototype.send = originalXhrSend;
			XMLHttpRequest.prototype.setRequestHeader = originalXhrSetRequestHeader;
		}
	});

	it("retries failed XMLHttpRequest restoration without stacking interception", () => {
		const originalFetch = vi.fn(async () => new Response("ok"));
		const onIntercept = vi.fn();
		globalThis.fetch = originalFetch as unknown as typeof fetch;
		useMockXmlHttpRequest();

		const originalXhrOpen = XMLHttpRequest.prototype.open;
		const originalXhrSend = XMLHttpRequest.prototype.send;
		const originalXhrSetRequestHeader =
			XMLHttpRequest.prototype.setRequestHeader;
		const interceptor = createFetchInterceptor({ onIntercept });

		interceptor.start();
		const installedXhrSend = XMLHttpRequest.prototype.send;

		Object.defineProperty(XMLHttpRequest.prototype, "send", {
			configurable: true,
			value: installedXhrSend,
			writable: false,
		});

		try {
			expect(() => interceptor.stop()).toThrow();
			expect(globalThis.fetch).toBe(originalFetch);
			expect(XMLHttpRequest.prototype.open).toBe(originalXhrOpen);
			expect(XMLHttpRequest.prototype.send).toBe(installedXhrSend);
			expect(XMLHttpRequest.prototype.setRequestHeader).toBe(
				originalXhrSetRequestHeader,
			);

			Object.defineProperty(XMLHttpRequest.prototype, "send", {
				configurable: true,
				value: installedXhrSend,
				writable: true,
			});

			expect(() => interceptor.stop()).not.toThrow();
			expect(XMLHttpRequest.prototype.send).toBe(originalXhrSend);

			MockXMLHttpRequest.enqueueResponse({ body: "ok" });
			interceptor.start();
			const xhr = new XMLHttpRequest();
			xhr.open("GET", "https://example.com/restarted-xhr");
			xhr.send();
			expect(onIntercept).toHaveBeenCalledOnce();
			interceptor.stop();
		} finally {
			globalThis.fetch = originalFetch as unknown as typeof fetch;
			Object.defineProperty(XMLHttpRequest.prototype, "open", {
				configurable: true,
				value: originalXhrOpen,
				writable: true,
			});
			Object.defineProperty(XMLHttpRequest.prototype, "send", {
				configurable: true,
				value: originalXhrSend,
				writable: true,
			});
			Object.defineProperty(XMLHttpRequest.prototype, "setRequestHeader", {
				configurable: true,
				value: originalXhrSetRequestHeader,
				writable: true,
			});
		}
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
