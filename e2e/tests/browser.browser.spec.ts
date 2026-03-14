import { expect, test } from "@playwright/test";

type BrowserIntercept = {
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

declare global {
	interface Window {
		e2e: {
			runConcurrentFetchScenario: () => Promise<{
				eventsA: BrowserIntercept[];
				eventsB: BrowserIntercept[];
			}>;
			runConcurrentXhrScenario: () => Promise<{
				eventsA: BrowserIntercept[];
				eventsB: BrowserIntercept[];
			}>;
			runFetchScenario: (options?: {
				useMatcher?: boolean;
			}) => Promise<BrowserIntercept[]>;
			runXhrScenario: (options?: {
				useMatcher?: boolean;
			}) => Promise<BrowserIntercept[]>;
		};
	}
}

test("intercepts real browser fetch traffic", async ({ page }) => {
	await page.goto("/", { waitUntil: "networkidle" });

	const events = await page.evaluate(() => window.e2e.runFetchScenario());

	expect(events).toHaveLength(1);
	expect(events[0]?.request.method).toBe("POST");
	expect(events[0]?.request.body).toEqual({ source: "fetch" });
	expect(events[0]?.request.url).toContain("/api/intercepted?client=fetch");
	expect(events[0]?.response.status).toBe(200);
	expect(events[0]?.response.headers["x-fixture-source"]).toBe("e2e-server");
	expect(events[0]?.response.body).toMatchObject({
		body: { source: "fetch" },
		method: "POST",
		path: "/api/intercepted",
		query: { client: "fetch" },
	});
});

test("intercepts real browser xhr traffic and respects matcher filters", async ({
	page,
}) => {
	await page.goto("/", { waitUntil: "networkidle" });

	const events = await page.evaluate(() =>
		window.e2e.runXhrScenario({ useMatcher: true }),
	);

	expect(events).toHaveLength(1);
	expect(events[0]?.request.method).toBe("POST");
	expect(events[0]?.request.body).toEqual({ source: "xhr" });
	expect(events[0]?.request.url).toContain("/api/intercepted?client=xhr");
	expect(events[0]?.response.status).toBe(200);
	expect(events[0]?.response.body).toMatchObject({
		body: { source: "xhr" },
		method: "POST",
		path: "/api/intercepted",
		query: { client: "xhr" },
	});
});

test("keeps remaining browser fetch interceptors active and snapshots in-flight requests", async ({
	page,
}) => {
	await page.goto("/", { waitUntil: "networkidle" });

	const result = await page.evaluate(() =>
		window.e2e.runConcurrentFetchScenario(),
	);

	expect(result.eventsA).toHaveLength(1);
	expect(result.eventsA[0]?.request.body).toEqual({ source: "fetch-both" });
	expect(result.eventsA[0]?.response.body).toMatchObject({
		query: { client: "fetch-both" },
	});

	expect(result.eventsB).toHaveLength(3);
	expect(result.eventsB.map((event) => event.request.body)).toEqual([
		{ source: "fetch-both" },
		{ source: "fetch-b-only" },
		{ source: "fetch-in-flight" },
	]);
	expect(result.eventsB[2]?.response.body).toMatchObject({
		query: { client: "fetch-in-flight", delayMs: "50" },
	});
});

test("keeps remaining browser xhr interceptors active across out-of-order stops", async ({
	page,
}) => {
	await page.goto("/", { waitUntil: "networkidle" });

	const result = await page.evaluate(() =>
		window.e2e.runConcurrentXhrScenario(),
	);

	expect(result.eventsA).toHaveLength(1);
	expect(result.eventsA[0]?.request.body).toEqual({ source: "xhr-both" });
	expect(result.eventsA[0]?.response.body).toMatchObject({
		query: { client: "xhr-both" },
	});

	expect(result.eventsB).toHaveLength(2);
	expect(result.eventsB.map((event) => event.request.body)).toEqual([
		{ source: "xhr-both" },
		{ source: "xhr-b-only" },
	]);
});
