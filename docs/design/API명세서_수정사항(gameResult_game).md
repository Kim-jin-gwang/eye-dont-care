# API 명세서 수정사항 — game / gameResult

구현 완료에 따라 실제 동작과 명세서를 일치시키기 위한 수정 목록입니다.
대상 문서는 `API 명세서 최종/API 명세서/API 명세서/` 아래 3개 파일입니다.

| # | 문서 | 수정 규모 |
| --- | --- | --- |
| 1 | 게임 결과 제출 | 큼 (Request 전면) |
| 2 | 게임 목록 조회 | 작음 (필드 1개) |
| 3 | 게임 상세 조회 | 작음 (필드 2개) |

ERD 수정도 함께 필요합니다. 문서 맨 아래에 정리했습니다.

---

## 1. 게임 결과 제출 (`POST /api/v1/game-results`)

### 1-1. Request Header

`Authorization`을 임시로 `X-Participant-Key`로 대체합니다. 인증 도메인이 완성되면 되돌립니다.

**수정 전**

| 파라미터 | 타입 | 필수여부 | 설명 |
| --- | --- | --- | --- |
| Authorization | String | 필수 | JWT 액세스 토큰(Bearer) |
| Content-Type | String | 필수 | application/json |

**수정 후**

| 파라미터 | 타입 | 필수여부 | 설명 |
| --- | --- | --- | --- |
| X-Participant-Key | String | 필수 | 임시 인증 헤더. `USER:{userId}` 또는 `GUEST:{guestSessionId}` 형식. 인증 도메인 완성 시 `Authorization`으로 교체 |
| Content-Type | String | 필수 | application/json |

### 1-2. Request Elements

**수정 전**

| 파라미터 | 타입 | 필수여부 | 설명 |
| --- | --- | --- | --- |
| playId | String(UUID) | NOT NULL | 클라 생성 멱등키 |
| gameId | Long | NOT NULL | 게임 ID |
| playMode | String(enum) | NOT NULL | SOLO |
| participants | Array | NOT NULL | participantId,outcome,rank,score |
| gameResult | Object(JSONB) | NOT NULL | 게임별 상세(6.5 스키마) |

**수정 후**

| 파라미터 | 타입 | 필수여부 | 설명 |
| --- | --- | --- | --- |
| playId | String(UUID) | NOT NULL | 클라 생성 멱등키. 재시도 시 동일 값 전송 |
| gameId | Long | NOT NULL | 게임 ID. (게임 × 플레이 모드 × 난이도) 조합을 식별 |
| startedAt | String(ISO 8601) | NOT NULL | 경기 시작 시각 |
| endedAt | String(ISO 8601) | NOT NULL | 경기 종료 시각 |
| participants | Array | NOT NULL | participantKey, participantType, slotNo, displayName, outcome, rank |
| gameResult | Object(JSONB) | NOT NULL | 게임별 상세. 서버는 검증하지 않고 그대로 저장 |

**변경 요약**

- `playMode` **삭제** — `gameId`가 이미 플레이 모드를 식별하므로 중복 정보입니다. 두 값을 함께 받으면 서로 어긋날 수 있어 제거했습니다.
- `startedAt`, `endedAt` **추가** — `games_results`의 `NOT NULL` 컬럼이며 서버가 만들어낼 수 없는 값입니다.

### 1-3. participants 배열 요소

새로 추가하는 표입니다.

| 필드 | 타입 | 필수여부 | 설명 |
| --- | --- | --- | --- |
| participantKey | String | NOT NULL | `USER:{userId}` / `GUEST:{guestSessionId}` / AI는 임의 식별자 |
| participantType | String(enum) | NOT NULL | USER / GUEST / AI |
| slotNo | int | NOT NULL | 슬롯 번호. `gameResult.players[].slotNo`와 연결 |
| displayName | String(50) | NOT NULL | 표시 이름. 게스트 닉네임 보존용 |
| outcome | String(enum) | NOT NULL | WIN / LOSE / DRAW / FORFEIT / COMPLETED |
| rank | int | NOT NULL | 최종 순위. 1 이상, 참가자 수 이하 |

**변경 요약**

- `participantId` → **`participantKey`** 로 이름 변경. 숫자 PK로 오해되지 않도록 했습니다.
- `participantType`, `slotNo`, `displayName` **추가** — `participants_` 테이블의 필수 컬럼이며 서버가 유추할 수 없습니다.
- `score` **삭제** — 점수는 `gameResult` JSONB에 있고, 랭킹 집계 시 파싱해서 사용합니다. 두 곳에 두면 불일치 위험이 있습니다.

### 1-4. 요청 예시

**수정 후**

```json
POST /api/v1/game-results
X-Participant-Key: USER:1
Content-Type: application/json

{
  "playId": "019abcde-1234-4abc-8def-0123456789ab",
  "gameId": 1,
  "startedAt": "2026-07-28T09:00:00Z",
  "endedAt": "2026-07-28T09:01:00Z",
  "participants": [
    {
      "participantKey": "USER:1",
      "participantType": "USER",
      "slotNo": 1,
      "displayName": "눈싸움장인",
      "outcome": "WIN",
      "rank": 1
    },
    {
      "participantKey": "GUEST:019abcde-5678",
      "participantType": "GUEST",
      "slotNo": 2,
      "displayName": "구경꾼",
      "outcome": "LOSE",
      "rank": 2
    }
  ],
  "gameResult": {
    "durationMs": 60000,
    "players": [
      { "slotNo": 1, "goals": 5 },
      { "slotNo": 2, "goals": 3 }
    ]
  }
}
```

`playId`는 완전한 UUID 형식이어야 합니다. 기존 예시의 `"019abcde-1234"`는 UUID가 아니라 파싱에 실패합니다.

### 1-5. 오류 응답

**수정 전** — 400 `INVALID_RESULT`, 409 `DUPLICATE_RESULT`, 401 `AUTH_INVALID_TOKEN`

**수정 후**

| HTTP | code | message | 발생 조건 |
| --- | --- | --- | --- |
| 400 | COMMON-001 | 요청 값이 올바르지 않습니다. | Bean Validation 실패 (필수값 누락, 형식 오류) |
| 400 | COMMON-002 | 요청 본문을 읽을 수 없습니다. | JSON 파싱 실패, `playId`가 UUID 형식이 아님 |
| 400 | GAMERESULT-003 | 참가자 정보가 올바르지 않습니다. | `slotNo` 중복, `rank`가 참가자 수 초과, `participantKey` 형식 오류 |
| 400 | GAMERESULT-004 | 경기 참가자만 결과를 제출할 수 있습니다. | 요청자가 `participants`에 없음 |
| 400 | GAMERESULT-005 | 경기 시작 시각과 종료 시각이 올바르지 않습니다. | `endedAt` < `startedAt` |
| 404 | GAMERESULT-002 | 게임을 찾을 수 없습니다. | `gameId` 미존재 |
| 409 | GAMERESULT-001 | 이미 제출된 결과입니다. | `playId` 중복 |
| 500 | COMMON-500 | 서버 내부 오류가 발생했습니다. | 예상하지 못한 오류 |

오류 코드가 `<DOMAIN>-<NUMBER>` 형식으로 통일됩니다. 기존 `INVALID_RESULT`, `AUTH_INVALID_TOKEN` 같은 표기는 코드 컨벤션과 다릅니다.

`X-Participant-Key` 헤더가 없으면 400이 반환됩니다. 인증 도메인 완성 후 401로 변경됩니다.

### 1-6. 응답 예시 (성공)

```json
HTTP/1.1 201
Content-Type: application/json

{
  "code": "RESULT_SUBMITTED",
  "message": "게임 결과가 저장되었습니다.",
  "data": {
    "resultId": 5001
  }
}
```

`success` 필드는 공통 응답 구조에서 제거되었습니다.

---

## 2. 게임 목록 조회 (`GET /api/v1/games`)

### 2-1. Response Elements

**수정 전**

| 필드 | 타입 | 필수여부 | 설명 |
| --- | --- | --- | --- |
| games | Array | NOT NULL | 게임 목록(gameId,gameName,summary,thumbnailUrl,playModes) |

**수정 후**

| 필드 | 타입 | 필수여부 | 설명 |
| --- | --- | --- | --- |
| games | Array | NOT NULL | 게임 목록(gameId, gameName, playMode) |

**변경 요약**

- `summary`, `thumbnailUrl` **삭제** — 표시용 데이터는 프론트엔드가 `gameName` ENUM 기준으로 매핑합니다.
- `playModes`(배열) → **`playMode`**(단일 값) — `games` 한 행이 (게임 × 모드 × 난이도) 조합이므로 행마다 모드가 하나입니다.

### 2-2. 응답 예시

**수정 후**

```json
HTTP/1.1 200
Content-Type: application/json

{
  "code": "GAME_LIST_FOUND",
  "message": "게임 목록을 조회했습니다.",
  "data": {
    "games": [
      { "gameId": 1, "gameName": "HOCKEY", "playMode": "INVITE" },
      { "gameId": 2, "gameName": "HOCKEY", "playMode": "RANDOM" },
      { "gameId": 3, "gameName": "HOCKEY", "playMode": "AI" }
    ]
  }
}
```

**프론트엔드 주의사항을 문서에 추가해주세요.**

> 같은 게임이 모드별로 여러 행으로 반환됩니다. 현재 시드는 16행이며
> `gameName`으로 묶어 모드 선택 버튼을 구성해야 합니다.
> 예: `EYEFIGHT`는 SOLO / INVITE / RANDOM / AI(난이도 1·2·3) 총 6행

---

## 3. 게임 상세 조회 (`GET /api/v1/games/{gameId}`)

### 3-1. Response Elements

**수정 전**

| 필드 | 타입 | 필수여부 | 설명 |
| --- | --- | --- | --- |
| gameId | Long | NOT NULL | 게임 ID |
| gameName | String | NOT NULL | 게임 종류 |
| rule | String | NOT NULL | 게임 규칙 |
| controlGuide | String | NOT NULL | 눈 조작 방법 |
| playModes | Array | NOT NULL | 지원 모드 |
| difficulties | Array | NULL | 지원 난이도(1/2/3) |
| minPlayers | int | NOT NULL | 최소 인원 |
| maxPlayers | int | NOT NULL | 최대 인원 |

**수정 후**

| 필드 | 타입 | 필수여부 | 설명 |
| --- | --- | --- | --- |
| gameId | Long | NOT NULL | 게임 ID |
| gameName | String(enum) | NOT NULL | EYEFIGHT / BLINK / DRAWING / RHYTHM / HOCKEY |
| playMode | String(enum) | NOT NULL | SOLO / INVITE / RANDOM / AI |
| difficulty | int | NULL | 난이도. 1(EASY) / 2(NORMAL) / 3(HARD). 눈싸움 AI 대결만 값을 가짐 |

**변경 요약**

- `rule`, `controlGuide`, `minPlayers`, `maxPlayers` **삭제** — 프론트엔드가 관리합니다.
- `playModes`(배열) → **`playMode`**(단일), `difficulties`(배열) → **`difficulty`**(단일)

### 3-2. 응답 예시

**수정 후**

```json
HTTP/1.1 200
Content-Type: application/json

{
  "code": "GAME_FOUND",
  "message": "게임 상세를 조회했습니다.",
  "data": {
    "gameId": 7,
    "gameName": "EYEFIGHT",
    "playMode": "AI",
    "difficulty": 1
  }
}
```

### 3-3. 오류 응답

404의 code를 `GAME_NOT_FOUND` → **`GAME-001`** 로 수정합니다.

---

## 4. ERD 수정 — `games_results`

`play_id` 컬럼이 누락되어 있습니다.

**추가**

| 논리명 | 물리명 | 타입 | NULL | 비고 |
| --- | --- | --- | --- | --- |
| 플레이 ID | play_id | UUID | NOT NULL | UNIQUE. 클라 생성 멱등키 |

**최종 `games_results`**

```
id          BIGINT   NOT NULL   PK
play_id     UUID     NOT NULL   UNIQUE   ← 추가
game_id     BIGINT   NOT NULL   FK → games.id
game_result JSONB    NOT NULL
started_at  TIMESTAMP NOT NULL
ended_at    TIMESTAMP NOT NULL
created_at  TIMESTAMP NOT NULL
updated_at  TIMESTAMP NOT NULL
```

`play_id` 없이는 중복 제출을 감지할 수 없어 409 응답이 불가능합니다.
프론트엔드가 네트워크 오류로 재시도하면 같은 경기가 두 번 저장되고 랭킹이 왜곡됩니다.

**`games.play_mode` 값 변경**

```
수정 전   SOLO / MULTI / AI
수정 후   SOLO / INVITE / RANDOM / AI
```

**`participants_`** 는 ERD 그대로입니다. `score` 컬럼은 추가하지 않았습니다.

---

## 5. 다른 도메인 담당자에게 전달할 사항

| 대상 | 내용 |
| --- | --- |
| 프론트엔드 | 게임 카드가 모드별로 분리되어 16개 반환됩니다. `gameName`으로 묶는 처리가 필요합니다. |
| 프론트엔드 | 결과 제출 시 `participantKey`, `participantType`, `slotNo`, `displayName`, `startedAt`, `endedAt`을 보내야 합니다. |
| 프론트엔드 | `playId`는 경기 시작 시 UUID로 생성해 보관하고, 재시도 시 동일 값을 전송해야 합니다. |
| 인증 담당 | `GameResultController`의 `@RequestHeader("X-Participant-Key")`를 JWT 추출 로직으로 교체해야 합니다. |
| 대기방 담당 | `play_mode`가 INVITE/RANDOM을 포함하므로 초대방 생성 요청의 `roomType`이 중복 정보가 됩니다. 하나만 받는 방향을 제안합니다. |
| 랭킹 담당 | 점수가 컬럼이 아니라 `game_result` JSONB에 있습니다. 게임별로 필드명이 달라(`goals`, `survivalTimeMs`, `totalScore`, `blinkCount`) 쿼리 분기가 필요합니다. |
