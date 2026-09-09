/**
 * 라이브 데모 진입점 — `VITE_DEMO_MODE=true` 빌드에서만 `main.ts`가 동적으로 import한다.
 *
 * `globalThis.fetch`와 `globalThis.WebSocket`을 감싸, 백엔드로 향하는 호출(`/api/v1/**`, `/ws/**`)만
 * 브라우저 안의 데모 백엔드로 돌리고 그 외(MediaPipe CDN 등)는 원래 구현으로 그대로 보낸다.
 * 앱 코드는 데모 여부를 모르며, 실제 백엔드와 같은 계약으로 동작한다.
 */
import { DemoStore } from './store'
import { DemoRestBackend, type DemoRequest } from './rest'
import { installDemoWebSocket, resetRealtime } from './realtime'

const API_PREFIX = '/api/v1/'
const WS_PREFIX = '/ws/'

declare global {
  interface Window {
    __EDC_DEMO__?: {
      reset: () => void
    }
  }
}

export function installDemoBackend(): void {
  const store = new DemoStore()
  const rest = new DemoRestBackend(store)
  const nativeFetch = globalThis.fetch.bind(globalThis)

  globalThis.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = toUrl(input)
    if (!url || url.origin !== globalThis.location.origin || !url.pathname.startsWith(API_PREFIX)) {
      return nativeFetch(input, init)
    }

    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    const request: DemoRequest = {
      method,
      path: url.pathname,
      query: url.searchParams,
      body: await parseBody(init?.body ?? null, input),
      headers,
    }

    // 실제 네트워크처럼 아주 짧은 지연을 준다(로딩 상태가 한 프레임은 보이도록).
    await new Promise((resolve) => setTimeout(resolve, 40 + Math.random() * 80))
    return rest.handle(request)
  }

  installDemoWebSocket(store, rest, WS_PREFIX)

  globalThis.window.__EDC_DEMO__ = {
    reset: () => {
      try {
        Object.keys(globalThis.localStorage)
          .filter((key) => key.startsWith('eye-dont-care.'))
          .forEach((key) => globalThis.localStorage.removeItem(key))
        globalThis.sessionStorage.clear()
      } catch {
        // 스토리지 접근이 막힌 환경이면 그냥 새로고침만 한다.
      }
      resetRealtime()
      globalThis.location.reload()
    },
  }

  console.info(
    '%c eye-dont-care 라이브 데모 ',
    'background:#2563eb;color:#fff;border-radius:4px;padding:2px 6px;font-weight:600',
    '\n백엔드 없이 브라우저 안의 목(mock) 백엔드로 동작합니다.',
    '\n- 혼자하기·AI 모드: 실제 눈 추적으로 플레이, 기록·주간 랭킹은 이 브라우저에 저장',
    '\n- 랜덤 매칭·친구 대결: 데모 봇이 상대로 입장(에어하키 제외)',
    '\n- 카카오 로그인·실시간 캠 공유는 실제 서버가 필요해 비활성',
    '\n- 데이터 초기화: window.__EDC_DEMO__.reset()',
  )
}

function toUrl(input: RequestInfo | URL): URL | null {
  try {
    if (input instanceof URL) return input
    if (typeof input === 'string') return new URL(input, globalThis.location.origin)
    return new URL(input.url, globalThis.location.origin)
  } catch {
    return null
  }
}

async function parseBody(
  body: BodyInit | null,
  input: RequestInfo | URL,
): Promise<unknown> {
  if (typeof body === 'string') {
    try {
      return JSON.parse(body)
    } catch {
      return body
    }
  }
  if (body === null && input instanceof Request) {
    try {
      const text = await input.clone().text()
      return text ? JSON.parse(text) : null
    } catch {
      return null
    }
  }
  return null
}
