import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type FixtureServer, startFixtureServer } from "../src/fixture-server";

type InterceptSnapshot = {
	request: {
		body: unknown;
		headers: Record<string, string>;
		method: string;
		url: string;
	};
	response: {
		body: unknown;
		headers: Record<string, string>;
		status: number;
		statusText: string;
	};
};

type CreateFetchInterceptor =
	typeof import("../../src/index")["createFetchInterceptor"];

function headersToObject(headers: Headers): Record<string, string> {
	return Object.fromEntries(headers.entries());
}

async function readBody(message: Request | Response): Promise<unknown> {
	const text = await message.text();
	const contentType = message.headers.get("content-type") ?? "";

	if (contentType.includes("application/json") && text) {
		try {
			return JSON.parse(text);
		} catch {
			return text;
		}
	}

	return text;
}

async function serializeIntercept(
	request: Request,
	response: Response,
): Promise<InterceptSnapshot> {
	return {
		request: {
			body: await readBody(request),
			headers: headersToObject(request.headers),
			method: request.method,
			url: request.url,
		},
		response: {
			body: await readBody(response),
			headers: headersToObject(response.headers),
			status: response.status,
			statusText: response.statusText,
		},
	};
}

async function loadCreateFetchInterceptor(): Promise<CreateFetchInterceptor> {
	const libraryUrl = new URL("../../dist/index.js", import.meta.url);
	const libraryModule = (await import(libraryUrl.href)) as {
		createFetchInterceptor: CreateFetchInterceptor;
	};

	return libraryModule.createFetchInterceptor;
}

describe("real network behavior in Node", () => {
	let fixtureServer: FixtureServer;
	let createFetchInterceptor: CreateFetchInterceptor;

	beforeAll(async () => {
		fixtureServer = await startFixtureServer();
		createFetchInterceptor = await loadCreateFetchInterceptor();
	});

	afterAll(async () => {
		await fixtureServer.close();
	});

	it("intercepts real fetch traffic with the default matcher", async () => {
		const intercepted: InterceptSnapshot[] = [];
		const pending: Array<Promise<void>> = [];
		const interceptor = createFetchInterceptor({
			onIntercept: (request, response) => {
				const task = serializeIntercept(request, response).then((event) => {
					intercepted.push(event);
				});
				pending.push(task);
			},
		});

		interceptor.start();

		try {
			await fetch(`${fixtureServer.origin}/api/intercepted?client=node`, {
				body: JSON.stringify({ source: "node" }),
				headers: { "content-type": "application/json" },
				method: "POST",
			});
		} finally {
			interceptor.stop();
		}

		await Promise.all(pending);

		expect(intercepted).toHaveLength(1);
		expect(intercepted[0]?.request.body).toEqual({ source: "node" });
		expect(intercepted[0]?.request.url).toContain(
			"/api/intercepted?client=node",
		);
		expect(intercepted[0]?.response.status).toBe(200);
		expect(intercepted[0]?.response.body).toMatchObject({
			body: { source: "node" },
			method: "POST",
			path: "/api/intercepted",
			query: { client: "node" },
		});
	});

	it("respects matcher filters against real fetch traffic", async () => {
		const intercepted: InterceptSnapshot[] = [];
		const pending: Array<Promise<void>> = [];
		const interceptor = createFetchInterceptor({
			matcher: (request) =>
				new URL(request.url).pathname === "/api/intercepted",
			onIntercept: (request, response) => {
				const task = serializeIntercept(request, response).then((event) => {
					intercepted.push(event);
				});
				pending.push(task);
			},
		});

		interceptor.start();

		try {
			await fetch(`${fixtureServer.origin}/api/intercepted?client=node`, {
				body: JSON.stringify({ source: "matched" }),
				headers: { "content-type": "application/json" },
				method: "POST",
			});
			await fetch(`${fixtureServer.origin}/api/ignored?client=node`, {
				body: JSON.stringify({ source: "ignored" }),
				headers: { "content-type": "application/json" },
				method: "POST",
			});
		} finally {
			interceptor.stop();
		}

		await Promise.all(pending);

		expect(intercepted).toHaveLength(1);
		expect(intercepted[0]?.request.url).toContain(
			"/api/intercepted?client=node",
		);
		expect(intercepted[0]?.response.body).toMatchObject({
			body: { source: "matched" },
			path: "/api/intercepted",
		});
	});

	it("keeps remaining fetch interceptors active and snapshots in-flight requests", async () => {
		const interceptedByA: InterceptSnapshot[] = [];
		const interceptedByB: InterceptSnapshot[] = [];
		const pending: Array<Promise<void>> = [];
		const interceptorA = createFetchInterceptor({
			onIntercept: (request, response) => {
				const task = serializeIntercept(request, response).then((event) => {
					interceptedByA.push(event);
				});
				pending.push(task);
			},
		});
		const interceptorB = createFetchInterceptor({
			onIntercept: (request, response) => {
				const task = serializeIntercept(request, response).then((event) => {
					interceptedByB.push(event);
				});
				pending.push(task);
			},
		});

		interceptorA.start();
		interceptorB.start();

		try {
			await fetch(`${fixtureServer.origin}/api/intercepted?client=node-both`, {
				body: JSON.stringify({ source: "node-both" }),
				headers: { "content-type": "application/json" },
				method: "POST",
			});

			interceptorA.stop();

			await fetch(
				`${fixtureServer.origin}/api/intercepted?client=node-b-only`,
				{
					body: JSON.stringify({ source: "node-b-only" }),
					headers: { "content-type": "application/json" },
					method: "POST",
				},
			);

			const inFlightRequest = fetch(
				`${fixtureServer.origin}/api/intercepted?client=node-in-flight&delayMs=50`,
				{
					body: JSON.stringify({ source: "node-in-flight" }),
					headers: { "content-type": "application/json" },
					method: "POST",
				},
			);

			interceptorB.stop();

			await inFlightRequest;
		} finally {
			interceptorA.stop();
			interceptorB.stop();
		}

		await Promise.all(pending);

		expect(interceptedByA).toHaveLength(1);
		expect(interceptedByA[0]?.request.body).toEqual({ source: "node-both" });
		expect(interceptedByA[0]?.response.body).toMatchObject({
			query: { client: "node-both" },
		});

		expect(interceptedByB).toHaveLength(3);
		expect(interceptedByB.map((event) => event.request.body)).toEqual([
			{ source: "node-both" },
			{ source: "node-b-only" },
			{ source: "node-in-flight" },
		]);
		expect(interceptedByB[2]?.response.body).toMatchObject({
			query: { client: "node-in-flight", delayMs: "50" },
		});
	});
});
