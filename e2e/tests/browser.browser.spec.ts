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
