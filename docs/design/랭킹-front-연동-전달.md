# 랭킹 API 프론트 연동 가이드 (전달용)

대상: 프론트엔드 · 기준 브랜치: `dev` · 상태: **백엔드 구현 완료, 연동만 남음**

지금 `RankingPage.vue`/`CommunityPage`가 mock(`mocks/pages.ts`)을 쓰는데, 아래 실제 API로 교체하면 돼.

---

## 0. 엔드포인트 요약
| 용도 | Method · URL | 인증 |
|---|---|---|
| 홈 요약(게임별 top N + 내 순위) | `GET /api/v1/rankings?limit=3` | **필수(JWT)** |
| 게임별 상세(페이지네이션) | `GET /api/v1/rankings/{gameName}?page=1&size=20` | **필수(JWT)** |

- 공통 응답 envelope: `{ "code", "message", "data" }`
- **비로그인 시 401** → 게스트에겐 랭킹 호출하지 말 것(로그인 유도).

---

## 1. 게임 ↔ 랭킹 매핑 (중요)

랭킹은 **아래 5개 (게임 × 특정 모드)** 만 집계한다. 표시명 매핑도 함께.

| 표시명 | `gameName`(요청·응답) | 시드에 있는 모드 | **랭킹 집계 모드** | `rankType` | `unit` | 값 의미 |
|---|---|---|---|---|---|---|
| 에어하키 | `HOCKEY` | INVITE·RANDOM·AI | **RANDOM** | `WIN_COUNT` | `win` | 승리 횟수 |
| 눈싸움 | `EYEFIGHT` | SOLO·INVITE·RANDOM | **SOLO** | `BEST_SCORE` | `second` | 최고 기록(초) |
| 그림 그리기 | `DRAWING` | AI | **AI** | `BEST_SCORE` | `point` | 최고 점수 |
| 리듬 | `RHYTHM` | SOLO·INVITE·RANDOM | **SOLO** | `BEST_SCORE` | `point` | 최고 점수 |
| 깜빡이 | `BLINK` | SOLO·INVITE·RANDOM | **SOLO** | `BEST_SCORE` | `count` | 최고 깜빡임 수 |

- ⚠️ **집계 모드 외 플레이는 랭킹에 안 잡힌다.** 예) 에어하키를 INVITE로, 깜빡이를 INVITE로 해도 랭킹에 안 올라감.
- `gameName`은 **대문자 enum 문자열 고정.** `hockey`·`에어하키` 등은 400(RANKING-001).

---

## 2. 홈 요약 — `GET /api/v1/rankings?limit=3`

`limit`(기본 3): 게임별 상위 몇 명. 응답은 **5개 게임 전부**를 한 번에 준다.

### 응답 예시
```json
{
  "code": "RANKING_LIST_FOUND",
  "message": "랭킹을 조회했습니다.",
  "data": {
    "period": "weekly",
    "weekStart": "2026-08-03",
    "games": [
      {
        "gameName": "HOCKEY",
        "rankType": "WIN_COUNT",
        "unit": "win",
        "top": [
          { "rank": 1, "userId": 5,  "nickname": "졸린수달",   "value": 7, "achievedAt": null },
          { "rank": 2, "userId": 12, "nickname": "빠른너구리", "value": 5, "achievedAt": null },
          { "rank": 3, "userId": 3,  "nickname": "깜빡왕",     "value": 4, "achievedAt": null }
        ],
        "myRank": { "rank": 8, "value": 2 }
      },
      {
        "gameName": "BLINK",
        "rankType": "BEST_SCORE",
        "unit": "count",
        "top": [
          { "rank": 1, "userId": 5, "nickname": "졸린수달", "value": 42, "achievedAt": null }
        ],
        "myRank": null
      }
      // ... EYEFIGHT, DRAWING, RHYTHM 포함 총 5개
    ]
  }
}
```

- **`top[].achievedAt`은 항상 `null`** (요약에는 시각 안 내려줌). 시각이 필요하면 상세 API 사용.
- 기록 없는 게임은 `top: []`, 안 해본 유저는 `myRank: null`.

---

## 3. 게임별 상세 — `GET /api/v1/rankings/{gameName}?page=1&size=20`

- **`page`는 1부터** (0 넣지 말 것). `size` 기본 20.
- 예: `GET /api/v1/rankings/BLINK?page=1&size=20`

### 응답 예시
```json
{
  "code": "GAME_RANKING_FOUND",
  "message": "게임 랭킹을 조회했습니다.",
  "data": {
    "gameName": "BLINK",
    "rankType": "BEST_SCORE",
    "unit": "count",
    "period": "weekly",
    "weekStart": "2026-08-03",
    "rankings": [
      { "rank": 1, "userId": 5, "nickname": "졸린수달", "value": 42, "achievedAt": "2026-08-04T02:11:00Z" },
      { "rank": 2, "userId": 9, "nickname": "느린곰",   "value": 38, "achievedAt": "2026-08-03T21:03:00Z" }
    ],
    "myRank": { "rank": 5, "value": 30 },
    "page": 1,
    "size": 20,
    "totalElements": 37,
    "totalPages": 2
  }
}
```

---

## 4. 필드 설명

| 필드 | 타입 | 설명 |
|---|---|---|
| `period` | string | 항상 `"weekly"` |
| `weekStart` | date | 이번 주 시작일(월요일, KST 기준). 예 `"2026-08-03"` |
| `gameName` | enum string | `HOCKEY`/`EYEFIGHT`/`DRAWING`/`RHYTHM`/`BLINK` → 프론트에서 표시명 매핑 |
| `rankType` | enum string | `WIN_COUNT`(승리수) / `BEST_SCORE`(최고점) |
| `unit` | string | `win`/`second`/`point`/`count` → 값 옆에 단위 렌더 |
| `top[]` / `rankings[]` | array | 랭킹 항목 목록 |
| ↳ `rank` | int | 순위(1부터, **공동순위 없음** — 동점은 선착순으로 갈림) |
| ↳ `userId` | long | 유저 ID |
| ↳ `nickname` | string | 표시 닉네임 |
| ↳ `value` | long | 점수/승수 등 (단위는 `unit`) |
| ↳ `achievedAt` | datetime\|null | 기록 달성 시각(상세만 채움, 요약은 null) |
| `myRank` | object\|null | 내 순위. **안 해봤으면 `null`** |
| ↳ `myRank.rank` / `myRank.value` | int / long | 내 순위·값 (닉네임 없음) |
| `page`/`size`/`totalElements`/`totalPages` | 상세 전용 | 페이지네이션 |

### 렌더 팁
- 값 표시: `value` + `unit` (예: `42 count` → "42회", `52 second` → "52초", `7 win` → "7승", `점수`는 그대로).
- `myRank == null` → "아직 기록이 없어요" 같은 안내.
- `top[]`/`rankings[]`가 빈 배열 → "이번 주 랭킹이 아직 없어요".

---

## 5. 에러 / 제약

| 상황 | 응답 |
|---|---|
| 비로그인 | **401** (JWT 필요) |
| 잘못된 gameName (소문자·한글·미지원) | **400** `RANKING-001` "지원하지 않는 게임입니다." |

### 데이터가 비어 보일 때 체크
- **게임 결과 제출이 살아있어야** 랭킹에 데이터가 생김:
  - `BEST_SCORE` 게임 → 제출 시 `gameResult: {"<slot>":{"score":N}}` 로 점수를 넣어야 그 유저가 랭킹에 뜸.
  - `WIN_COUNT`(에어하키) → 참가자 `outcome`이 `WIN`이어야 카운트.
- **이번 주 데이터만** 집계(월요일 리셋). 지난주/전체기간 조회 불가.
- **회원만** 집계 — 게스트(userId 없음)·AI는 랭킹에 안 뜸.

---

## 6. mock → 실제 교체 체크리스트
- [ ] `RankingPage.vue`의 `import { gameRankings } from '../mocks/pages'` 제거 → 실제 API 호출
- [ ] 홈: `GET /api/v1/rankings?limit=3` 한 번으로 5개 게임 요약 채우기
- [ ] 상세 탭: 탭 value를 **대문자 gameName**으로, `GET /api/v1/rankings/{gameName}?page=&size=`
- [ ] `myRank == null`, 빈 배열 처리
- [ ] `gameName`(enum) → 한글 표시명 매핑 테이블
- [ ] `value` + `unit` 조합 렌더
- [ ] 비로그인 시 호출 차단(로그인 유도)

---

## 요약
> 인증(JWT) 필수 · `gameName`은 대문자 enum · 값은 `value`+`unit` · `myRank`/빈배열 null 처리 · 데이터는 "이번 주·해당 모드·회원"만. 이것만 맞추면 바로 붙는다.
