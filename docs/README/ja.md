# @hsblabs/fetch-interceptor

言語:
[English](https://github.com/hsblabs/fetch-interceptor/blob/main/README.md)
| [日本語](https://github.com/hsblabs/fetch-interceptor/blob/main/docs/README/ja.md)
| [简体中文](https://github.com/hsblabs/fetch-interceptor/blob/main/docs/README/zh-CN.md)
| [한국어](https://github.com/hsblabs/fetch-interceptor/blob/main/docs/README/ko.md)

`@hsblabs/fetch-interceptor` は、ブラウザ上の `fetch` と `XMLHttpRequest` を透過的に傍受するための軽量な TypeScript ライブラリです。

最大の特長は、傍受したリクエストとレスポンスを標準 Web API の `Request` と `Response` に正規化して扱えることです。これにより、XHR 固有のライフサイクルの複雑さを意識せずに通信内容を解析できます。

## 特長

- 標準 API に統一
  fetch と XHR の両方を `Request` / `Response` で扱えます。
- 完全な型安全
  TypeScript で予測しやすく扱いやすい API です。
- 安全なライフサイクル制御
  必要なときに傍受を開始し、不要になればネイティブ API をきれいに復元できます。
- 依存なし
  小さく、組み込みやすい構成です。
- ブラウザ向け設計
  フロントエンド統合を前提としたシンプルな API です。

## インストール

```sh
npm install @hsblabs/fetch-interceptor
# or
yarn add @hsblabs/fetch-interceptor
# or
pnpm add @hsblabs/fetch-interceptor
# or
bun add @hsblabs/fetch-interceptor
```

## 開発

```sh
pnpm test
pnpm test:e2e:node
pnpm test:e2e:browser
```

ブラウザ E2E テストを初回実行する前に、`pnpm test:e2e:install` で Playwright Chromium をインストールしてください。

## 使い方

呼び出し側は最小限で済むように設計されています。以下の例では、特定の API だけを傍受してレスポンス JSON を取り出します。

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

			// たとえば Chrome 拡張の main world から isolated world へ
			// データを転送する場合:
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

// ...処理...

// interceptor.stop();
```

条件判定、レスポンス正規化、利用側コールバックのいずれかが失敗しても、ライブラリは `console.error` へ報告し、元の通信結果を維持します。`onError` に渡されるのは基盤の fetch/XHR 自体が失敗した場合だけです。status 0 で完了した XHR は、status 0 を持てる唯一の標準 `Response` である `Response.error()` として表現されるため、本文とヘッダーは利用できません。

## API リファレンス

### `createFetchInterceptor(options: FetchInterceptorOptions): FetchInterceptor`

通信傍受の開始と停止を制御するインスタンスを生成します。

### `FetchInterceptorOptions`

| プロパティ | 型 | 説明 |
| --- | --- | --- |
| `matcher` | `((request: Request) => boolean)?` | リクエストを傍受するかを判定する述語です。省略時はすべての通信を傍受します。例外は報告され、条件不一致として扱われます。 |
| `onIntercept` | `(request: Request, response: Response) => void \| Promise<void>` | 条件に一致した通信完了時に呼ばれるコールバックです。`response` は fetch では独立した clone、XHR では等価な標準 `Response` です。コールバックの失敗は元の通信結果を変更しません。 |
| `onError` | `(request: Request, error: FetchInterceptorError) => void \| Promise<void>` | レスポンス生成前に基盤の通信が失敗した場合だけ呼ばれます。fetch は `error` または `abort`、XHR は加えて `timeout` を報告できます。 |

### `FetchInterceptor`

| メソッド | 説明 |
| --- | --- |
| `start()` | `fetch` と `XMLHttpRequest` を上書きして傍受を開始します。導入に失敗した場合は完了済みの変更を戻し、停止状態を維持します。 |
| `stop()` | 元のブラウザ API をすべて復元します。一部の復元に失敗した場合は例外を投げ、アダプターを重ねずに再度 `stop()` で失敗分を再試行できる状態を維持します。 |

## ユースケース

- ブラウザ拡張でのデータ抽出
  SPA が内部で呼ぶ REST や GraphQL のレスポンスを直接取得できます。
- デバッグとロギング
  特定 API のリクエストとレスポンスを観測できます。
- テスト補助
  実際のレスポンスを見ながらテストフローを制御できます。

## このライブラリが解決すること

ブラウザ通信の横断的な監視では、`fetch` と XHR を別々に扱うことが複雑さの原因になります。`@hsblabs/fetch-interceptor` はその分断をなくし、`Request` / `Response` を中心に監視、抽出、デバッグ、自動化へ集中できるようにします。

## ライセンス

MIT
