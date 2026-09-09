# 👁️ eye-dont-care — 눈싸움 게임 웹 플랫폼

> **눈이 곧 컨트롤러다.** 설치도, 특수 장비도 없이 — 웹캠 하나로 눈(시선·깜빡임)으로 조작하는 캐주얼 미니게임 플랫폼

[![Live Demo](https://img.shields.io/badge/Live_Demo-Cloudflare_Pages-F38020?style=flat-square&logo=cloudflare&logoColor=white)](https://eye-dont-care.pages.dev)
[![Backend](https://img.shields.io/badge/Spring_Boot-4.1-6DB33F?style=flat-square&logo=springboot&logoColor=white)](#-기술-스택)
[![Frontend](https://img.shields.io/badge/Vue_3-TypeScript-4FC08D?style=flat-square&logo=vue.js&logoColor=white)](#-기술-스택)
[![Data](https://img.shields.io/badge/dbt_%C2%B7_Airflow-analytics-FF694B?style=flat-square&logo=dbt&logoColor=white)](#-데이터-파이프라인)

브라우저에서 바로 접속해 웹캠 기반 시선 추적·눈 깜빡임 인식으로 플레이하는 웹 게임 서비스입니다.
게임당 약 1분, 가볍게 즐기고 **주간 랭킹과 대결**로 다시 찾아오는 것을 목표로 합니다.

- 🎮 **라이브 데모**: <https://eye-dont-care.pages.dev> — 백엔드 없이 브라우저 안의 목(mock) 백엔드로 동작합니다. 웹캠을 허용하면 실제 눈 추적으로 플레이할 수 있습니다. ([데모 범위와 동작 원리](docs/DEMO.md))
- 📅 **기간**: 2026.07.15 ~ 2026.08.10 (6인 팀 프로젝트)

---

## 🎮 미니게임 5종

| 게임 | 이름 | 조작 | 설명 |
| --- | --- | --- | --- |
| 🏒 `air` | **Eye Hockey** (에어 하키) | 시선 + 깜빡임 | 시선으로 말렛을 움직이고 눈을 깜빡여 퍽을 타격 |
| 👀 `hold` | **Eye See** (눈싸움) | 눈 뜨고 버티기 | 먼저 감는 쪽이 패배 — 생존 시간 승부 |
| ✏️ `draw` | **Eye Draw** (눈으로 그리기) | 시선 | 시선으로 제시어를 그리면 AI(Vision 모델)가 채점 |
| 🎵 `rhythm` | **Blink the Beat** (리듬 게임) | 깜빡임 | 흘러오는 비트에 맞춰 눈을 깜빡여 콤보 |
| ⚡ `blink` | **Eye Show Speed** (눈 깜빡이기) | 깜빡임 | 제한 시간 안에 더 많이, 더 빠르게 깜빡이기 |

**플레이 모드**: 혼자하기(랭킹 반영) · 친구와 대결(초대코드) · 랜덤 매칭 · AI 대결(일부 게임)

---

## 🧑‍💻 내 역할과 기여

**백엔드 REST API 설계 및 분산 데이터 파이프라인 구축** — 전체 575커밋 중 **152커밋**(팀 저장소 기준), 릴리스 1.0.1 ~ 1.0.9 총 9회에 걸쳐 담당 도메인을 구현·안정화했습니다.

| 영역 | 담당 내용 |
| --- | --- |
| **백엔드 도메인** | `game`(카탈로그) · `gameresult`(결과 제출·기록·신기록 판정) · `matchmaking`(랜덤 매칭·WebSocket 알림) · `ranking`(주간 랭킹·순위 변동) · `group`(길드·게시판) REST API 설계 및 구현 |
| **실시간 매칭** | Redis 원자적 선점 예약(예약 → 확정 → 보상) 기반 랜덤 매칭 확정 흐름, `/ws/match` WebSocket 실시간 매칭 알림, 세션 식별자 기반 stale 종료 이벤트 차단 |
| **데이터 모델링** | 게임마다 다른 경기 결과를 PostgreSQL **JSONB** 단일 스키마(`{슬롯: {score}}`)로 적재하고 주간 랭킹 집계 구조 설계 (ERD·명세 문서는 [`docs/design/`](docs/design/)) |
| **데이터 파이프라인** | dbt(staging → fact → 분석 마트 + `reconcile_score` 감사 모델) + Airflow 야간 배치 DAG ([`pipeline/`](pipeline/)) |
| **프론트엔드 연동** | 랭킹·경기 기록·프로필·커뮤니티 페이지의 API 연동과 대결 결과 표시, QA 픽스 |
| **AI 협업 프로세스** | API 명세·ERD 선행 작성 → Claude Code 구현 → 계약 검증의 개발 루프. 브랜치 정책·컨벤션·커밋·테스트·시크릿 스캔·PR 템플릿의 7단계 Pre-PR 하네스 스킬([`.claude/skills/`](.claude/skills/)) |
| **QA 대응** | 3차례 QA 라운드에서 접수된 피드백 60건 이상을 이슈 단위로 분해, 담당 백엔드 이슈 약 20건 수정·배포 (정리 문서: [`docs/design/`](docs/design/)의 QA 파일) |

### 핵심 설계 — 랜덤 매칭은 왜 락 없이 동작하나

Lua 스크립트 하나로 몰아넣거나 분산 락을 잡는 대신, **Redis 명령의 순서**만으로 경쟁 조건을 해소했습니다.

```
신청   ZADD queue NX <queuedAt> <participant>   ← 먼저. 재신청이 최초 대기 시각을 덮어쓰지 못한다
       HSETNX entry ...                          ← 나중. 실패(중복 신청)해도 앞 명령이 바꾼 것이 없어 롤백 불필요
성사   ZPOPMIN queue 2                           ← 단일 원자 명령으로 두 후보를 선점(MATCHING)
확정   대기방 생성 → 같은 시도(matchAttemptId)인지 재검증 → ENTERING_ROOM → MATCH_SUCCESS 푸시
보상   방 생성/확정 실패 시 원래 score로 ZADD     ← 대기 순서가 밀리지 않는다
```

- TTL은 entry에만 걸리므로 Sorted Set에 남는 **유령 member**는 선점 시점에 걸러 버립니다(재시도 상한 5회).
- 이전 WebSocket 세션의 늦은 종료 이벤트가 새 매칭을 취소하지 않도록, 종료 이벤트는 **현재 활성 세션의 것일 때만** 취소로 처리합니다.
- 상세: [`docs/design/matchmaking_Redis_키설계안.md`](docs/design/matchmaking_Redis_키설계안.md), 구현: [`backend/.../matchmaking/`](backend/src/main/java/com/eyedontcare/backend/matchmaking/)

### 트러블슈팅 기록

| 문제 | 원인 | 해결 |
| --- | --- | --- |
| 동시 매칭 요청 시 같은 상대가 두 매칭에 잡힘 | 상대 조회와 확정 사이에 다른 요청이 끼어드는 경쟁 조건 | Redis 원자 연산으로 상대를 예약(MATCHING)한 뒤 확정하는 흐름 + 실패 시 대기 상태 복원 보상 로직 |
| 재접속 직후 새 매칭이 곧바로 취소됨 | 뒤늦게 끊긴 이전 WebSocket 세션의 종료 이벤트가 새 매칭의 취소로 처리 | 매칭에 세션 식별자를 연결하고 현재 활성 세션의 종료일 때만 취소 |
| 상대 이탈과 정상 종료를 구분하지 못함 | 두 경우가 같은 연결 종료 이벤트로 처리됨 | 게임 세션에 종료 사유 상태(`GAME_OVER` 선행 여부)를 도입해 이탈 시에만 몰수승 처리 |
| 성사된 참가자가 재신청하면 두 번째 방에 배정됨 | 큐에서 빠진 참가자를 `ZADD NX`가 다시 넣음 | 후보 선점 시 `SEARCHING`이 아닌 member를 걸러 버림 |

---

## ✨ 주요 기능

- **웹캠 눈 추적**: MediaPipe FaceLandmarker 기반 시선 추정·깜빡임 인식 (전용 장비 불필요, 추론은 전부 브라우저에서)
- **실시간 멀티플레이**: WebSocket 매칭·대기방·게임 세션, LiveKit(OpenVidu) 기반 상대 캠 화면 공유
- **주간 랭킹**: 게임별 최고 기록/승수 집계(KST 월요일 리셋, 동점은 선착순), 게임 종료 시 순위 변동(상승·하락) 표시
- **경기 기록**: 최근 경기 목록과 상세(점수·플레이 시간·함께한 상대 스코어보드)
- **길드(커뮤니티)**: 길드 생성·검색·코드 입장, 게시판(후기·댓글)
- **회원/게스트**: 이메일·카카오 로그인(JWT), 비회원도 게스트 세션으로 바로 플레이
- **AI 채점**: 눈으로 그리기 결과를 GPT-4o Vision으로 판정

## 🛠 기술 스택

| 구분 | 기술 |
| --- | --- |
| Frontend | Vue 3 (Composition API) + TypeScript, Vite, Vitest, Pinia, Vue Router, MediaPipe FaceLandmarker, WebSocket, livekit-client |
| Backend | Spring Boot 4.1 (Java 25), Spring Data JPA, Spring Security + JWT(jjwt), 카카오 OAuth, Spring WebSocket, LiveKit Server SDK |
| Data | PostgreSQL 15 (JSONB), Redis 7, dbt, Apache Airflow |
| Infra | Docker Compose, Jenkins CI/CD, Nginx 리버스 프록시, OpenVidu 3.x (single-node) |

## 🏗 아키텍처

```
브라우저 (Vue 3 + MediaPipe 눈 추적 — 추론은 전부 클라이언트에서)
   │  REST /api/v1/**        WebSocket /ws/**         WebRTC(캠 공유)
   ▼                              ▼                        ▼
Nginx ──────────────▶ Spring Boot Backend ◀──────────▶ LiveKit
                          │           │
                     PostgreSQL     Redis
                    (기록·랭킹·길드) (게스트 세션·매칭)
                          │
                   dbt · Airflow (야간 배치: 감사 + 분석 마트)
```

백엔드 도메인: `auth` `user` `guest` `game` `gameresult` `gamesession` `matchmaking` `waitingroom` `ranking` `group`

## 📊 데이터 파이프라인

게임 결과를 **감사(reconcile) + 분석(analytics)** 하는 배치 ELT. 서빙은 실시간(운영 DB 직접)이라 배치는 서빙 경로가 아닙니다.

```
운영 public                dbt (analytics 스키마)
 games_results ─┐   stg_game_results ─┐
 games ─────────┘                     ├─▶ fact_game_play ─┬─▶ agg_user_game_stats   [분석]
 participants_ ──▶ stg_participants ──┘   (score 컬럼)     └─▶ game_daily_stats       [분석]
 (game_result JSONB) ───────────────────▶ reconcile_score  (사본 vs 원본 대조)        [감사]
```

- `reconcile_score`: 실시간 서빙용 `participants_.score` 사본과 `game_result` JSONB 원본을 대조해 불일치만 남김 (`MISSING` → 안전 백필 후보, `MISMATCH` → 사람 검토)
- Airflow DAG `game_analytics_pipeline`: 매일 KST 03:00, `dbt run → dbt test → data_quality_check`. 자세한 내용은 [`pipeline/README.md`](pipeline/README.md)

## 📂 프로젝트 구조

```
├── frontend/            # Vue 3 SPA (pages, components, composables, lib/games)
│   └── src/demo/        # 라이브 데모용 브라우저 내 목 백엔드 (VITE_DEMO_MODE=true 빌드에서만 포함)
├── backend/             # Spring Boot (도메인별 패키지 구조)
├── pipeline/            # dbt 모델 + Airflow DAG
├── docs/
│   ├── design/          # 내가 작성한 설계·전달 문서 (매칭 Redis 키 설계, JSONB 스키마, 랭킹·소모임 ERD, QA 정리 …)
│   ├── planning/        # 팀 기획 산출물 (기능 정의서, API 명세서, 와이어프레임)
│   ├── DEMO.md          # 라이브 데모 동작 원리·범위·배포 방법
│   └── *.md             # 팀 컨벤션 (브랜치·커밋·코드·PR)
├── deploy/             # 배포 문서 (빌드·배포 절차, 외부 서비스, 시연 시나리오, 데모 시드)
├── compose.dev.yml      # 로컬 개발 스택 (FE HMR + BE bootRun + DB + Redis)
├── compose.prod.yml     # 프로덕션 스택
└── Jenkinsfile          # CI/CD 파이프라인
```

## 🚀 실행 방법

### 전체 스택 (Docker Compose)

```bash
docker compose -f compose.dev.yml up -d      # frontend:3000, backend:8000, postgres, redis
# http://localhost:3000
```

카카오 로그인·AI 채점(Vision API)·미디어 서버(LiveKit) 등 외부 연동 키는 환경변수로 주입합니다 (`.env.example`, [`deploy/external-services.md`](deploy/external-services.md)). 키가 없어도 서비스는 기동되며 해당 기능만 비활성됩니다.

### 라이브 데모 빌드 (백엔드 없이)

```bash
cd frontend && npm ci
npm run build:demo        # vite build --mode demo → dist/
npm run preview:demo      # 로컬 미리보기
```

`frontend/src/demo/`가 `fetch`/`WebSocket`을 가로채 브라우저 안에서 백엔드 계약을 그대로 흉내 냅니다. 자세한 범위는 [`docs/DEMO.md`](docs/DEMO.md).

### 테스트

```bash
cd frontend && npm test && npm run build   # Vitest + 타입체크 포함 빌드
cd backend && ./gradlew test               # JUnit (Redis·PostgreSQL 컨테이너 필요)
```

## 📏 개발 컨벤션

브랜치 전략(`main` ← `release/*` ← `dev` ← 작업 브랜치), Conventional Commits, 코드 컨벤션, PR/Issue 템플릿은 [`docs/`](docs/)와 [`CONTRIBUTING.md`](CONTRIBUTING.md)에 있습니다. AI 코딩 에이전트가 이 규칙을 준수하도록 [`.claude/skills/`](.claude/skills/)·[`.agents/skills/`](.agents/skills/)에 검증 스킬을 두었습니다.
