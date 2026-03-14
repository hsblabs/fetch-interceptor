import { readFile } from "node:fs/promises";
import {
	createServer,
	type IncomingMessage,
	type ServerResponse,
} from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type FixtureServer = {
	close: () => Promise<void>;
	origin: string;
};

const e2eDirectory = dirname(
	fileURLToPath(new URL("../package.json", import.meta.url)),
);
const repositoryRoot = resolve(e2eDirectory, "..");
const browserFixturesDirectory = resolve(e2eDirectory, "fixtures/browser");
const browserIndexPath = resolve(browserFixturesDirectory, "index.html");
const browserAppPath = resolve(browserFixturesDirectory, "app.js");
const libraryBundlePath = resolve(repositoryRoot, "dist/index.js");

async function readRequestBody(request: IncomingMessage): Promise<string> {
	let body = "";

	for await (const chunk of request) {
		body += chunk.toString();
	}

	return body;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function parseBody(body: string): unknown {
	if (!body) {
		return "";
	}

	try {
		return JSON.parse(body);
	} catch {
		return body;
	}
}

async function writeFileResponse(
	response: ServerResponse,
	filePath: string,
	contentType: string,
) {
	const body = await readFile(filePath, "utf8");

	response.statusCode = 200;
	response.setHeader("cache-control", "no-store");
	response.setHeader("content-type", contentType);
	response.end(body);
}

async function handleApiRequest(
	request: IncomingMessage,
	response: ServerResponse,
	requestUrl: URL,
) {
	const delayMs = Number(requestUrl.searchParams.get("delayMs") ?? "0");

	if (Number.isFinite(delayMs) && delayMs > 0) {
		await delay(delayMs);
	}

	const requestBody = await readRequestBody(request);
	const payload = {
		body: parseBody(requestBody),
		method: request.method ?? "GET",
		path: requestUrl.pathname,
		query: Object.fromEntries(requestUrl.searchParams.entries()),
	};

	response.statusCode = 200;
	response.setHeader("cache-control", "no-store");
	response.setHeader("content-type", "application/json");
	response.setHeader("x-fixture-source", "e2e-server");
	response.end(JSON.stringify(payload));
}

async function handleRequest(
	request: IncomingMessage,
	response: ServerResponse,
) {
	const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");

	if (requestUrl.pathname === "/" || requestUrl.pathname === "/index.html") {
		await writeFileResponse(
			response,
			browserIndexPath,
			"text/html; charset=utf-8",
		);
		return;
	}

	if (requestUrl.pathname === "/app.js") {
		await writeFileResponse(
			response,
			browserAppPath,
			"text/javascript; charset=utf-8",
		);
		return;
	}

	if (requestUrl.pathname === "/library.js") {
		await writeFileResponse(
			response,
			libraryBundlePath,
			"text/javascript; charset=utf-8",
		);
		return;
	}

	if (requestUrl.pathname.startsWith("/api/")) {
		await handleApiRequest(request, response, requestUrl);
		return;
	}

	if (requestUrl.pathname === "/favicon.ico") {
		response.statusCode = 204;
		response.end();
		return;
	}

	response.statusCode = 404;
	response.setHeader("content-type", "text/plain; charset=utf-8");
	response.end("Not found");
}

export async function startFixtureServer(port = 0): Promise<FixtureServer> {
	const server = createServer(async (request, response) => {
		try {
			await handleRequest(request, response);
		} catch (error) {
			response.statusCode = 500;
			response.setHeader("content-type", "application/json; charset=utf-8");
			response.end(
				JSON.stringify({
					message: error instanceof Error ? error.message : String(error),
				}),
			);
		}
	});

	await new Promise<void>((resolvePromise, rejectPromise) => {
		server.once("error", rejectPromise);
		server.listen(port, "127.0.0.1", () => {
			server.off("error", rejectPromise);
			resolvePromise();
		});
	});

	const address = server.address();

	if (!address || typeof address === "string") {
		throw new Error("Fixture server failed to bind to a TCP port.");
	}

	return {
		close: () =>
			new Promise<void>((resolvePromise, rejectPromise) => {
				server.close((error) => {
					if (error) {
						rejectPromise(error);
						return;
					}

					resolvePromise();
				});
			}),
		origin: `http://127.0.0.1:${address.port}`,
	};
}
