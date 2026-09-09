# API 요청·응답 예시 복붙용

명세서의 **요청 예시 / 응답 예시** 블록에 그대로 덮어쓰면 되는 내용입니다.
실제 구현 기준이며, 여기 있는 JSON은 그대로 Postman에 넣어도 동작합니다.

---

# 1. 게임 결과 제출

`POST /api/v1/game-results`

## 요청 예시

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
      "participantKey": "USER:2",
      "participantType": "USER",
      "slotNo": 2,
      "displayName": "초롱이",
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

## 201 CREATED

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

## 400 BAD REQUEST — 필수값 누락·형식 오류

```json
HTTP/1.1 400
Content-Type: application/json

{
  "code": "COMMON-001",
  "message": "요청 값이 올바르지 않습니다.",
  "data": {
    "fieldErrors": [
      {
        "field": "startedAt",
        "reason": "경기 시작 시각은 필수입니다."
      }
    ]
  }
}
```

## 400 BAD REQUEST — 참가자 정보 오류

`slotNo` 중복, `rank`가 참가자 수 초과, `participantKey` 형식 오류

```json
HTTP/1.1 400
Content-Type: application/json

{
  "code": "GAMERESULT-003",
  "message": "참가자 정보가 올바르지 않습니다.",
  "data": null
}
```

## 400 BAD REQUEST — 요청자가 참가자가 아님

```json
HTTP/1.1 400
Content-Type: application/json

{
  "code": "GAMERESULT-004",
  "message": "경기 참가자만 결과를 제출할 수 있습니다.",
  "data": null
}
```

## 400 BAD REQUEST — 경기 시각 오류

`endedAt`이 `startedAt`보다 빠른 경우

```json
HTTP/1.1 400
Content-Type: application/json

{
  "code": "GAMERESULT-005",
  "message": "경기 시작 시각과 종료 시각이 올바르지 않습니다.",
  "data": null
}
```

## 404 NOT FOUND

```json
HTTP/1.1 404
Content-Type: application/json

{
  "code": "GAMERESULT-002",
  "message": "게임을 찾을 수 없습니다.",
  "data": null
}
```

## 409 CONFLICT — 중복 제출

같은 `playId`로 재요청한 경우

```json
HTTP/1.1 409
Content-Type: application/json

{
  "code": "GAMERESULT-001",
  "message": "이미 제출된 결과입니다.",
  "data": null
}
```

## 500 INTERNAL SERVER ERROR

```json
HTTP/1.1 500
Content-Type: application/json

{
  "code": "COMMON-500",
  "message": "서버 내부 오류가 발생했습니다.",
  "data": null
}
```

---

# 2. 게임 목록 조회

`GET /api/v1/games`

## 요청 예시

```json
GET /api/v1/games
```

## 200 OK

```json
HTTP/1.1 200
Content-Type: application/json

{
  "code": "GAME_LIST_FOUND",
  "message": "게임 목록을 조회했습니다.",
  "data": {
    "games": [
      { "gameId": 1,  "gameName": "HOCKEY",   "playMode": "INVITE" },
      { "gameId": 2,  "gameName": "HOCKEY",   "playMode": "RANDOM" },
      { "gameId": 3,  "gameName": "HOCKEY",   "playMode": "AI" },
      { "gameId": 4,  "gameName": "EYEFIGHT", "playMode": "SOLO" },
      { "gameId": 5,  "gameName": "EYEFIGHT", "playMode": "INVITE" },
      { "gameId": 6,  "gameName": "EYEFIGHT", "playMode": "RANDOM" },
      { "gameId": 7,  "gameName": "EYEFIGHT", "playMode": "AI" },
      { "gameId": 8,  "gameName": "EYEFIGHT", "playMode": "AI" },
      { "gameId": 9,  "gameName": "EYEFIGHT", "playMode": "AI" },
      { "gameId": 10, "gameName": "DRAWING",  "playMode": "AI" },
      { "gameId": 11, "gameName": "RHYTHM",   "playMode": "SOLO" },
      { "gameId": 12, "gameName": "RHYTHM",   "playMode": "INVITE" },
      { "gameId": 13, "gameName": "RHYTHM",   "playMode": "RANDOM" },
      { "gameId": 14, "gameName": "BLINK",    "playMode": "SOLO" },
      { "gameId": 15, "gameName": "BLINK",    "playMode": "INVITE" },
      { "gameId": 16, "gameName": "BLINK",    "playMode": "RANDOM" }
    ]
  }
}
```

같은 게임이 모드별로 여러 행 반환됩니다. `gameName`으로 묶어 모드 버튼을 구성해야 합니다.
`gameId` 7·8·9는 눈싸움 AI 대결의 난이도 1·2·3이며, 목록에서는 구분되지 않습니다.
난이도가 필요하면 상세 조회를 호출해야 합니다.

## 500 INTERNAL SERVER ERROR

```json
HTTP/1.1 500
Content-Type: application/json

{
  "code": "COMMON-500",
  "message": "서버 내부 오류가 발생했습니다.",
  "data": null
}
```

---

# 3. 게임 상세 조회

`GET /api/v1/games/{gameId}`

## 요청 예시

```json
GET /api/v1/games/7
```

## 200 OK — 난이도가 있는 경우 (눈싸움 AI 대결)

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

## 200 OK — 난이도가 없는 경우

```json
HTTP/1.1 200
Content-Type: application/json

{
  "code": "GAME_FOUND",
  "message": "게임 상세를 조회했습니다.",
  "data": {
    "gameId": 2,
    "gameName": "HOCKEY",
    "playMode": "RANDOM",
    "difficulty": null
  }
}
```

## 400 BAD REQUEST — gameId가 숫자가 아님

```json
HTTP/1.1 400
Content-Type: application/json

{
  "code": "COMMON-004",
  "message": "요청 값의 타입이 올바르지 않습니다.",
  "data": null
}
```

## 404 NOT FOUND

```json
HTTP/1.1 404
Content-Type: application/json

{
  "code": "GAME-001",
  "message": "게임을 찾을 수 없습니다.",
  "data": null
}
```

## 500 INTERNAL SERVER ERROR

```json
HTTP/1.1 500
Content-Type: application/json

{
  "code": "COMMON-500",
  "message": "서버 내부 오류가 발생했습니다.",
  "data": null
}
```

---

# 부록. 게임별 gameResult 예시

결과 제출 시 `gameResult`에 넣는 값입니다. 서버는 검증하지 않고 그대로 저장합니다.

## HOCKEY (에어하키)

```json
{
  "durationMs": 60000,
  "players": [
    { "slotNo": 1, "goals": 5 },
    { "slotNo": 2, "goals": 3 }
  ]
}
```

## EYEFIGHT (눈싸움)

```json
{
  "durationMs": 18400,
  "players": [
    { "slotNo": 1, "survivalTimeMs": 18400, "blinkedFirst": false },
    { "slotNo": 2, "survivalTimeMs": 18400, "blinkedFirst": true }
  ]
}
```

## DRAWING (그림 그리기)

```json
{
  "durationMs": 100000,
  "players": [
    {
      "slotNo": 1,
      "totalScore": 412,
      "rounds": [
        {
          "round": 1,
          "word": "사과",
          "wordLevel": 1,
          "correct": true,
          "baseScore": 100,
          "timeBonus": 32,
          "confidence": 0.87,
          "confidenceBonus": 20,
          "score": 152
        }
      ]
    }
  ]
}
```

## RHYTHM (리듬 게임)

```json
{
  "durationMs": 30000,
  "trackId": "track-01",
  "players": [
    {
      "slotNo": 1,
      "totalScore": 1750,
      "baseScore": 1200,
      "comboBonus": 350,
      "heartBonus": 200,
      "maxCombo": 24,
      "heartsLeft": 4,
      "hitCount": 48,
      "missCount": 6
    }
  ]
}
```

## BLINK (눈 깜빡이기)

```json
{
  "durationMs": 20000,
  "players": [
    { "slotNo": 1, "blinkCount": 98, "eventTriggered": true, "eventBonus": 15 },
    { "slotNo": 2, "blinkCount": 87, "eventTriggered": false, "eventBonus": 0 }
  ]
}
```

## 몰수 (FORFEIT)

나가기 버튼을 누른 경우입니다. `participants[].outcome`을 `FORFEIT`으로 보내고,
`gameResult`에는 중단 시점까지의 값을 담습니다.

```json
{
  "playId": "019abcde-9999-4abc-8def-0123456789ab",
  "gameId": 1,
  "startedAt": "2026-07-28T09:00:00Z",
  "endedAt": "2026-07-28T09:00:12Z",
  "participants": [
    {
      "participantKey": "USER:1",
      "participantType": "USER",
      "slotNo": 1,
      "displayName": "눈싸움장인",
      "outcome": "FORFEIT",
      "rank": 2
    },
    {
      "participantKey": "USER:2",
      "participantType": "USER",
      "slotNo": 2,
      "displayName": "초롱이",
      "outcome": "WIN",
      "rank": 1
    }
  ],
  "gameResult": {
    "durationMs": 12000,
    "players": [
      { "slotNo": 1, "goals": 1 },
      { "slotNo": 2, "goals": 2 }
    ]
  }
}
```

## 게스트 참가자

`participantType`을 `GUEST`로 보내면 `user_id`는 저장되지 않고 `displayName`만 남습니다.

```json
{
  "participantKey": "GUEST:019abcde-5678-4abc-8def-0123456789ab",
  "participantType": "GUEST",
  "slotNo": 2,
  "displayName": "구경꾼",
  "outcome": "LOSE",
  "rank": 2
}
```

## AI 참가자

```json
{
  "participantKey": "AI:EYEFIGHT-HARD",
  "participantType": "AI",
  "slotNo": 2,
  "displayName": "AI 하드",
  "outcome": "LOSE",
  "rank": 2
}
```
