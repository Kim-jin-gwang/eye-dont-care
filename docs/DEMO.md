# 라이브 데모 (Demo Mode)

운영 서버(`eyedontcare.shop`, 프로젝트 기간 중 운영한 EC2)는 프로젝트 종료 후 내려갔습니다. 정적 호스팅만으로 서비스를
체험할 수 있도록, **백엔드 계약을 그대로 흉내 내는 브라우저 내 목(mock) 백엔드**를 `frontend/src/demo/`에 두었습니다.

- 데모 URL: <https://eye-dont-care.pages.dev>
- 빌드: `cd frontend && npm run build:demo` (`vite build --mode demo` → `.env.demo`의 `VITE_DEMO_MODE=true`)

## 동작 원리

`main.ts`가 앱을 만들기 전에 `demo/install.ts`를 동적으로 불러와 두 가지를 감쌉니다.

| 가로채는 것 | 대상 | 처리 |
| --- | --- | --- |
| `globalThis.fetch` | 같은 origin의 `/api/v1/**` | `demo/rest.ts`가 `{code, message, data}` 엔벨로프로 응답 (그 외 요청은 원래 `fetch`로 통과 — MediaPipe CDN 등) |
| `globalThis.WebSocket` | `/ws/match`, `/ws/waiting-rooms/{id}`, `/ws/game-sessions/{id}` | `demo/realtime.ts`의 가짜 소켓이 서버 역할 수행 (그 외 URL은 원래 `WebSocket`) |

앱 코드(`src/api/*`, 페이지, 스토어)는 데모 여부를 모릅니다. 인증도 실제와 같이 `Authorization: Bearer <JWT>` /
`X-Guest-Session-Id` 헤더로 구분하며, 토큰은 서명 없는 데모용(`sub`에 userId)입니다.

| 모듈 | 역할 |
| --- | --- |
| `demo/store.ts` | 인메모리 상태 + 시드(회원 10명·길드 2개·경기 23건 — `deploy/seed-data/demo_seed_data.sql`을 옮김). 방문자가 만든 데이터만 `localStorage`에 저장 |
| `demo/rest.ts` | REST 라우터·핸들러 (게스트 세션, 인증, 사용자, 게임 카탈로그, 경기 결과, 랭킹, 길드·게시판, 그림 채점) |
| `demo/ranking.ts` | 주간 랭킹 온-리드 집계 — 백엔드 `RankingService`/`RankingGame` 규칙과 동일 (KST 월요일 리셋, BEST_SCORE/WIN_COUNT, 동점 선착순) |
| `demo/realtime.ts` | 매칭 큐(Redis Sorted Set + Hash 설계를 자료구조로 옮김), 대기방 상태 머신, 게임 세션 중계, **데모 봇** |

## 체험 범위

| 기능 | 데모 | 비고 |
| --- | --- | --- |
| 혼자하기 · AI 대결 (5종) | ✅ | 실제 MediaPipe 눈 추적으로 플레이. 결과·신기록·주간 랭킹은 이 브라우저에 저장 |
| 랜덤 매칭 · 친구와 대결 | ✅ 눈싸움·눈 깜빡이기·리듬 | **데모 봇**이 상대로 입장. 매칭 큐는 실서버와 같은 알고리즘(최초 대기 시각 보존 → 원자적 선점 → 예약/확정/보상) |
| 에어하키 대결 | ⛔ | 퍽 물리 동기화(호스트 권위)가 필요해 실서버 전용. AI 대결로 체험 가능 |
| 상대 캠 공유(WebRTC) | ⛔ | OpenVidu/LiveKit 미디어 서버 필요 |
| 이메일 로그인/가입 | ✅ | 아무 이메일·비밀번호로 즉시 가입·로그인 (시드 회원은 전시용이라 로그인 불가) |
| 카카오 로그인 | ⛔ | OAuth 키 필요 → 안내 메시지 |
| 눈으로 그리기 AI 채점 | 🟡 시뮬레이션 | 실제 서비스는 gpt-4o Vision. 데모는 1.2초 뒤 시뮬레이션 결과 반환(응답에 명시) |
| 랭킹 · 경기 기록 · 프로필 · 길드/게시판 | ✅ | 길드 기능은 회원 전용(실서버 동일) |

데이터 초기화: 브라우저 콘솔에서 `window.__EDC_DEMO__.reset()`.

## 배포 (Cloudflare Pages)

MediaPipe의 스레드 WASM(SharedArrayBuffer)에는 `Cross-Origin-Opener-Policy: same-origin` /
`Cross-Origin-Embedder-Policy: require-corp` 응답 헤더가 필요합니다. GitHub Pages는 응답 헤더를 설정할 수 없지만
Cloudflare Pages는 `public/_headers`로 가능해 Pages를 택했습니다. SPA 라우팅은 `public/_redirects`.

### 방법 A — Git 연동 (권장)

Cloudflare 대시보드 → Workers & Pages → Create → Pages → GitHub 저장소 연결

| 설정 | 값 |
| --- | --- |
| Root directory | `frontend` |
| Build command | `npm run build:demo` |
| Build output directory | `dist` |
| 환경 변수 | (없음 — `.env.demo`가 저장소에 포함) |

`main`에 push할 때마다 자동 배포됩니다.

### 방법 B — CLI

```bash
cd frontend && npm ci && npm run build:demo
npx wrangler login
npx wrangler pages project create eye-dont-care --production-branch main
npx wrangler pages deploy dist --project-name eye-dont-care
```

배포 후 확인: `curl -I https://eye-dont-care.pages.dev` 응답에 COOP/COEP 헤더가 있어야 눈 추적이 동작합니다.

## 실제 스택으로 배포하려면 (참고 청사진)

데모가 아닌 실제 백엔드를 무료 티어로 올리는 경우의 구성입니다. 저장소 루트의 [`render.yaml`](../render.yaml)이 Render Blueprint입니다.

| 구성 요소 | 서비스 | 비고 |
| --- | --- | --- |
| Backend (Spring Boot, Docker) | Render Web Service | `backend/Dockerfile.prod`, JVM 메모리 `-Xmx256m` 권장 |
| PostgreSQL | Neon (또는 Render Postgres) | `SPRING_DATASOURCE_URL=jdbc:postgresql://<host>/<db>?sslmode=require` |
| Redis | Render Key Value / Upstash | `SPRING_DATA_REDIS_HOST/PORT` (TLS 사용 시 `SPRING_DATA_REDIS_SSL_ENABLED=true`) |
| Frontend | Cloudflare Pages | 일반 빌드(`npm run build`) + `VITE_API_BASE_URL`은 `/api` 고정이므로 Pages Functions 또는 Worker로 `/api`, `/ws`를 백엔드로 프록시해야 함 |
| WebRTC | OpenVidu/LiveKit | 무료 티어 없음 — 생략 시 캠 공유만 비활성 |

필수 환경변수와 의미는 [`../deploy/build-and-deploy.md`](../deploy/build-and-deploy.md) §4를 참고하세요.
