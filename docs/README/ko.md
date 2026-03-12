# @hsblabs/fetch-interceptor

언어:
[English](https://github.com/hsblabs/fetch-interceptor/blob/main/README.md)
| [日本語](https://github.com/hsblabs/fetch-interceptor/blob/main/docs/README/ja.md)
| [简体中文](https://github.com/hsblabs/fetch-interceptor/blob/main/docs/README/zh-CN.md)
| [한국어](https://github.com/hsblabs/fetch-interceptor/blob/main/docs/README/ko.md)

`@hsblabs/fetch-interceptor`는 브라우저의 `fetch` 와 `XMLHttpRequest` 트래픽을 투명하게 가로채기 위한 경량 TypeScript 라이브러리입니다.

핵심 특징은 가로챈 요청과 응답을 표준 Web API 인 `Request` 와 `Response` 로 정규화한다는 점입니다. 덕분에 XHR 고유의 라이프사이클 복잡도를 직접 다루지 않고도 네트워크 트래픽을 분석할 수 있습니다.

## 특징

- 표준 API 중심의 통합
  fetch 와 XHR 모두를 `Request` / `Response` 로 다룰 수 있습니다.
- 완전한 타입 안정성
  TypeScript 에서 예측 가능하고 사용하기 쉬운 API 입니다.
- 안전한 라이프사이클 제어
  필요할 때 인터셉션을 시작하고, 끝난 뒤에는 원래 브라우저 API 를 깔끔하게 복원할 수 있습니다.
- 무의존성
  작고 통합하기 쉽습니다.
- 브라우저 환경에 최적화
  프런트엔드 통합을 염두에 둔 단순한 API 입니다.

## 설치

```sh
npm install @hsblabs/fetch-interceptor
# or
yarn add @hsblabs/fetch-interceptor
# or
pnpm add @hsblabs/fetch-interceptor
```

## 개발

```sh
pnpm test
pnpm test:e2e:node
pnpm test:e2e:browser
```

브라우저 E2E 테스트를 처음 실행하기 전에 `pnpm test:e2e:install` 로 Playwright Chromium 을 설치하세요.

## 사용법

호출부 코드를 최소화하는 것을 목표로 합니다. 아래 예시는 특정 API 경로만 가로채고 응답 JSON 을 추출합니다.

```ts
import { createFetchInterceptor } from "@hsblabs/fetch-interceptor";

const interceptor = createFetchInterceptor({
	matcher: (req) => {
		const url = new URL(req.url);
		return url.pathname.includes("/api/target-data") && req.method === "GET";
	},
	onIntercept: async (req, res) => {
		try {
			const data = await res.json();
			console.log("Intercepted data:", data);

			// 예를 들어 Chrome 확장의 main world 에서
			// isolated world 로 데이터를 전달할 때:
			// window.postMessage({ type: "INTERCEPTED_DATA", payload: data }, "*");
		} catch (error) {
			console.error("Failed to parse intercepted response:", error);
		}
	},
});

interceptor.start();

// ...작업 수행...

// interceptor.stop();
```

## API 레퍼런스

### `createFetchInterceptor(options: FetchInterceptorOptions): FetchInterceptor`

네트워크 인터셉션을 시작하고 중지하는 인스턴스를 생성합니다.

### `FetchInterceptorOptions`

| 속성 | 타입 | 설명 |
| --- | --- | --- |
| `matcher` | `((req: Request) => boolean)?` | 요청을 가로챌지 결정하는 predicate 입니다. 생략하면 모든 트래픽을 가로챕니다. |
| `onIntercept` | `(req: Request, res: Response) => void` | 조건에 맞는 요청이 완료되면 호출되는 콜백입니다. `res` 는 fetch 에서는 clone 된 응답이고, XHR 에서는 이에 상응하는 표준 `Response` 입니다. |

### `FetchInterceptor`

| 메서드 | 설명 |
| --- | --- |
| `start()` | `fetch` 와 `XMLHttpRequest` 를 override 하여 인터셉션을 시작합니다. 여러 번 호출해도 안전합니다. |
| `stop()` | 인터셉션을 중지하고 원래 브라우저 API 를 복원합니다. |

## 사용 사례

- 브라우저 확장에서 데이터 추출
  SPA 내부의 REST 또는 GraphQL 응답을 직접 캡처할 수 있습니다.
- 디버깅과 로깅
  특정 API 표면의 요청과 응답을 관찰할 수 있습니다.
- 테스트 보조
  실제 응답을 기준으로 테스트 흐름을 제어할 수 있습니다.

## 왜 이 라이브러리인가

브라우저 네트워크 트래픽을 횡단적으로 다룰 때 `fetch` 와 XHR 를 따로 처리하면 구현이 쉽게 복잡해집니다. `@hsblabs/fetch-interceptor` 는 그 분리를 없애고, 하나의 `Request` / `Response` 모델로 모니터링, 추출, 디버깅, 자동화에 집중할 수 있게 합니다.

## 라이선스

MIT
