import { createFetchInterceptor } from "/library.js";

function headersToObject(headers) {
	return Object.fromEntries(headers.entries());
}

async function readBody(message) {
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

async function serializeIntercept(request, response) {
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

function createMatcher(useMatcher) {
	if (!useMatcher) {
		return undefined;
	}

	return (request) => new URL(request.url).pathname === "/api/intercepted";
}

function sendXhr(url, body) {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open("POST", url);
		xhr.setRequestHeader("content-type", "application/json");
		xhr.addEventListener("load", () => resolve());
		xhr.addEventListener("error", () =>
			reject(new Error("XHR request failed.")),
		);
		xhr.send(JSON.stringify(body));
	});
}

async function runFetchScenario({ useMatcher = false } = {}) {
	const events = [];
	const pending = [];
	const interceptor = createFetchInterceptor({
		matcher: createMatcher(useMatcher),
		onIntercept: (request, response) => {
			const task = serializeIntercept(request, response).then((event) => {
				events.push(event);
			});
			pending.push(task);
		},
	});

	interceptor.start();

	try {
		await fetch("/api/intercepted?client=fetch", {
			body: JSON.stringify({ source: "fetch" }),
			headers: { "content-type": "application/json" },
			method: "POST",
		});

		if (useMatcher) {
			await fetch("/api/ignored?client=fetch", {
				body: JSON.stringify({ source: "ignored" }),
				headers: { "content-type": "application/json" },
				method: "POST",
			});
		}
	} finally {
		interceptor.stop();
	}

	await Promise.all(pending);

	return events;
}

async function runXhrScenario({ useMatcher = false } = {}) {
	const events = [];
	const pending = [];
	const interceptor = createFetchInterceptor({
		matcher: createMatcher(useMatcher),
		onIntercept: (request, response) => {
			const task = serializeIntercept(request, response).then((event) => {
				events.push(event);
			});
			pending.push(task);
		},
	});

	interceptor.start();

	try {
		await sendXhr("/api/intercepted?client=xhr", { source: "xhr" });

		if (useMatcher) {
			await sendXhr("/api/ignored?client=xhr", { source: "ignored" });
		}
	} finally {
		interceptor.stop();
	}

	await Promise.all(pending);

	return events;
}

window.e2e = {
	runFetchScenario,
	runXhrScenario,
};
