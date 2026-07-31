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

function createEventRecorder() {
	const events = [];
	const pending = [];

	return {
		events,
		onIntercept(request, response) {
			const task = serializeIntercept(request, response).then((event) => {
				events.push(event);
			});
			pending.push(task);
		},
		async flush() {
			await Promise.all(pending);
			return events;
		},
	};
}

function sendXhr(url, body) {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open("POST", url);
		xhr.setRequestHeader("content-type", "application/json");
		xhr.addEventListener("load", () => setTimeout(resolve, 0));
		xhr.addEventListener("error", () =>
			reject(new Error("XHR request failed.")),
		);
		xhr.send(JSON.stringify(body));
	});
}

async function runFetchScenario({ useMatcher = false } = {}) {
	const recorder = createEventRecorder();
	const interceptor = createFetchInterceptor({
		matcher: createMatcher(useMatcher),
		onIntercept: (request, response) => recorder.onIntercept(request, response),
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

	return recorder.flush();
}

async function runXhrScenario({ useMatcher = false } = {}) {
	const recorder = createEventRecorder();
	const interceptor = createFetchInterceptor({
		matcher: createMatcher(useMatcher),
		onIntercept: (request, response) => recorder.onIntercept(request, response),
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

	return recorder.flush();
}

async function runXhrNoContentScenario() {
	const recorder = createEventRecorder();
	let responseStatus = null;
	const interceptor = createFetchInterceptor({
		onIntercept: (request, response) => {
			responseStatus = response.status;
			recorder.onIntercept(request, response);
		},
	});

	interceptor.start();

	try {
		await sendXhr("/api/no-content", { source: "xhr-no-content" });
	} finally {
		interceptor.stop();
	}

	return {
		events: await recorder.flush(),
		responseStatus,
	};
}

async function runConcurrentFetchScenario() {
	const recorderA = createEventRecorder();
	const recorderB = createEventRecorder();
	const interceptorA = createFetchInterceptor({
		onIntercept: (request, response) =>
			recorderA.onIntercept(request, response),
	});
	const interceptorB = createFetchInterceptor({
		onIntercept: (request, response) =>
			recorderB.onIntercept(request, response),
	});

	interceptorA.start();
	interceptorB.start();

	try {
		await fetch("/api/intercepted?client=fetch-both", {
			body: JSON.stringify({ source: "fetch-both" }),
			headers: { "content-type": "application/json" },
			method: "POST",
		});

		interceptorA.stop();

		await fetch("/api/intercepted?client=fetch-b-only", {
			body: JSON.stringify({ source: "fetch-b-only" }),
			headers: { "content-type": "application/json" },
			method: "POST",
		});

		const inFlightRequest = fetch(
			"/api/intercepted?client=fetch-in-flight&delayMs=50",
			{
				body: JSON.stringify({ source: "fetch-in-flight" }),
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

	return {
		eventsA: await recorderA.flush(),
		eventsB: await recorderB.flush(),
	};
}

async function runConcurrentXhrScenario() {
	const recorderA = createEventRecorder();
	const recorderB = createEventRecorder();
	const interceptorA = createFetchInterceptor({
		onIntercept: (request, response) =>
			recorderA.onIntercept(request, response),
	});
	const interceptorB = createFetchInterceptor({
		onIntercept: (request, response) =>
			recorderB.onIntercept(request, response),
	});

	interceptorA.start();
	interceptorB.start();

	try {
		await sendXhr("/api/intercepted?client=xhr-both", { source: "xhr-both" });

		interceptorA.stop();

		await sendXhr("/api/intercepted?client=xhr-b-only", {
			source: "xhr-b-only",
		});
		interceptorB.stop();
	} finally {
		interceptorA.stop();
		interceptorB.stop();
	}

	return {
		eventsA: await recorderA.flush(),
		eventsB: await recorderB.flush(),
	};
}

window.e2e = {
	runConcurrentFetchScenario,
	runConcurrentXhrScenario,
	runFetchScenario,
	runXhrNoContentScenario,
	runXhrScenario,
};
