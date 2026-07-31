# @hsblabs/fetch-interceptor

语言:
[English](https://github.com/hsblabs/fetch-interceptor/blob/main/README.md)
| [日本語](https://github.com/hsblabs/fetch-interceptor/blob/main/docs/README/ja.md)
| [简体中文](https://github.com/hsblabs/fetch-interceptor/blob/main/docs/README/zh-CN.md)
| [한국어](https://github.com/hsblabs/fetch-interceptor/blob/main/docs/README/ko.md)

`@hsblabs/fetch-interceptor` 是一个轻量的 TypeScript 库，用于透明地拦截浏览器中的 `fetch` 和 `XMLHttpRequest` 流量。

它的核心特点是将拦截到的请求和响应统一为标准 Web API 的 `Request` 和 `Response` 对象。这样你就可以在不处理 XHR 生命周期细节的情况下分析网络流量。

## 特性

- 基于标准 API 的统一抽象
  fetch 和 XHR 都可以通过 `Request` / `Response` 处理。
- 完整的类型安全
  API 在 TypeScript 中可预测且易于使用。
- 安全的生命周期控制
  你可以在需要时开始拦截，并在结束后干净地恢复原生浏览器 API。
- 零依赖
  体积小，易于集成。
- 面向浏览器环境
  API 专为前端集成而设计。

## 安装

```sh
npm install @hsblabs/fetch-interceptor
# or
yarn add @hsblabs/fetch-interceptor
# or
pnpm add @hsblabs/fetch-interceptor
# or
bun add @hsblabs/fetch-interceptor
```

## 开发

```sh
pnpm test
pnpm test:e2e:node
pnpm test:e2e:browser
```

首次运行浏览器 E2E 测试前，请使用 `pnpm test:e2e:install` 安装 Playwright Chromium。

## 用法

这个库的目标是尽量减少调用端样板代码。下面的例子只拦截特定 API 路径，并提取响应中的 JSON。

```ts
import { createFetchInterceptor } from "@hsblabs/fetch-interceptor";

const interceptor = createFetchInterceptor({
	matcher: (request) => {
		const url = new URL(request.url);
		return (
			url.pathname.includes("/api/target-data") && request.method === "GET"
		);
	},
	onIntercept: async (request, response) => {
		try {
			const data = await response.json();
			console.log("Intercepted data:", data);

			// 例如，将数据从 Chrome 扩展的 main world
			// 转发到 isolated world:
			// window.postMessage({ type: "INTERCEPTED_DATA", payload: data }, "*");
		} catch (error) {
			console.error("Failed to parse intercepted response:", error);
		}
	},
	onError: (request, error) => {
		console.error(
			"Intercepted request failed:",
			request.url,
			error.transport,
			error.reason,
			error.cause,
		);
	},
});

interceptor.start();

// ...执行你的逻辑...

// interceptor.stop();
```

匹配、响应规范化或调用方回调失败时，库会通过 `console.error` 报告并保留原始网络结果。只有底层 fetch/XHR 本身失败时才会调用 `onError`。以 status 0 完成的 XHR 会表示为 `Response.error()`，因为它是唯一能持有 status 0 的标准 `Response`；因此响应体和响应头不可用。

## API 参考

### `createFetchInterceptor(options: FetchInterceptorOptions): FetchInterceptor`

创建一个用于启动和停止网络拦截的实例。

### `FetchInterceptorOptions`

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `matcher` | `((request: Request) => boolean)?` | 用于判断请求是否应被拦截的谓词。省略时将拦截所有流量。异常会被报告并视为不匹配。 |
| `onIntercept` | `(request: Request, response: Response) => void \| Promise<void>` | 当匹配请求完成时调用的回调。`response` 在 fetch 场景中是独立克隆，在 XHR 场景中是等价的标准 `Response`。回调失败不会改变原始网络结果。 |
| `onError` | `(request: Request, error: FetchInterceptorError) => void \| Promise<void>` | 仅在底层传输于生成响应前失败时调用。fetch 可报告 `error` 或 `abort`，XHR 还可报告 `timeout`。 |

### `FetchInterceptor`

| 方法 | 说明 |
| --- | --- |
| `start()` | 覆盖 `fetch` 和 `XMLHttpRequest` 以开始拦截。安装失败时会回滚已完成的修改并保持停止状态。 |
| `stop()` | 停止拦截。即使某一步恢复失败，也会尝试所有必要的恢复操作。 |

## 使用场景

- 浏览器扩展中的数据提取
  直接捕获 SPA 内部请求的 REST 或 GraphQL 响应。
- 调试与日志
  观察特定 API 的请求和响应。
- 测试辅助
  基于真实响应推进测试流程。

## 为什么使用这个库

当你需要横切处理浏览器网络流量时，`fetch` 和 XHR 分开处理通常会让实现变得混乱。`@hsblabs/fetch-interceptor` 消除了这种分裂，让你可以围绕统一的 `Request` / `Response` 模型专注于监控、提取、调试和自动化。

## 许可证

MIT
