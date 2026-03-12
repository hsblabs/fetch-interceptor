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
});
