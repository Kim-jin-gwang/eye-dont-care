# 게임 결과 제출 JSONB 계약 — 프론트 전달 (정정본)

작성: 게임결과/랭킹 담당
대상: 프론트 게임플레이 담당

> ⚠️ **정정 안내**: 앞서 "게임별 키(`survivalMs`/`blinkCount`/`totalScore`…)로 바꿔달라"고 요청했는데 **철회합니다.** 지금 프론트가 쓰는 **통일 구조(`{ "슬롯": { "score": N } }`)가 더 좋아서 그대로 유지**하면 됩니다. (랭킹·데이터 파이프라인에 더 적합)

---

## 0. 유지할 구조 (현재 그대로)

게임 종료 시 `POST /api/v1/game-results` 제출 시, 점수는 **`gameResult`(JSONB)** 에 아래 통일 구조로 담습니다.

```json
"gameResult": { "<슬롯번호>": { "score": <숫자> } }
```

- 게임 무관 **단일 `score`** (그 게임의 대표 점수 하나)
- **슬롯번호(slotNo) 키**로 참가자별 점수 표현 (혼자하기는 `"1"`, 대결은 `"1"`,`"2"`)
- 승패(에어하키)는 JSONB가 아니라 **참가자별 `outcome`**

랭킹은 이 구조를 `game_result -> 슬롯 ->> 'score'`로 **게임 상관없이 동일하게** 읽습니다.

---

## 1. 게임별 `score` 의미

| 게임(slug) | score 값 | 단위 | 랭킹 |
| --- | --- | --- | --- |
| 깜빡이 BLINK(blink) | 깜빡임 횟수 | 회 | score 최고값 |
| 눈싸움 EYEFIGHT(hold) | 생존 **초(정수)** `round(elapsedMs/1000)` | 초 | score 최고값 |
| 리듬 RHYTHM(rhythm) | 리듬 점수 | 점 | score 최고값 |
| 그림 DRAWING(draw) | 총점 | 점 | score 최고값 |
| 에어하키 HOCKEY(air) | 골 수(기록용) | 승 | **outcome=WIN 카운트** |

- **에어하키만** 랭킹이 `outcome=WIN`을 셈 → score(골 수)는 기록/표시용
- 나머지 4개는 랭킹이 `score` 최고값 사용
- **눈싸움은 초(정수)** — ms 아님(지금 프론트 그대로 OK)

---

## 2. 제출 예시

### 눈 깜빡이기(혼자하기) — SOLO
```json
POST /api/v1/game-results
{
  "playId": "0192...uuid",
  "gameId": 14,
  "startedAt": "2026-08-03T09:00:00Z",
  "endedAt": "2026-08-03T09:00:20Z",
  "participants": [
    { "participantKey": "USER:1", "participantType": "USER", "slotNo": 1,
      "displayName": "방울반짝", "outcome": "COMPLETED", "rank": 1 }
  ],
  "gameResult": { "1": { "score": 128 } }
}
```

### 눈싸움(혼자하기) — score는 초
```json
"gameResult": { "1": { "score": 87 } }
```

### 에어하키(랜덤매칭) — 2인, 승패 필수
```json
"participants": [
  { "participantKey": "USER:1", "participantType": "USER", "slotNo": 1,
    "displayName": "밤하늘", "outcome": "WIN",  "rank": 1 },
  { "participantKey": "USER:2", "participantType": "USER", "slotNo": 2,
    "displayName": "초록별", "outcome": "LOSE", "rank": 2 }
],
"gameResult": { "1": { "score": 3 }, "2": { "score": 1 } }
```

---

## 3. 규칙

- **구조 고정**: `{ "슬롯": { "score": 숫자 } }` — score는 **정수**
- **눈싸움 score = 초(정수)**
- `outcome`: 혼자하기=`COMPLETED`, 대결 승패=`WIN`/`LOSE` (enum: WIN/LOSE/DRAW/FORFEIT/COMPLETED)
- **모든 모드 동일하게 제출** — 랭킹은 `gameId`(모드 포함)로 대상 모드만 서버가 거름. 프론트는 정확한 `gameId`만 넣으면 됨
- **부가 정보가 필요하면 슬롯 안에 같이 넣기** (랭킹은 score만 읽음):
  ```json
  "gameResult": { "1": { "score": 24500, "maxCombo": 42 } }
  ```

---

## 4. 참고
- 랭킹 대상 모드: 에어하키=랜덤매칭, 눈싸움·리듬·깜빡이=혼자하기, 그림=AI
- 눈싸움 AI 모드는 **제거 확정** → 제출 대상 아님
- `participantType`은 `USER`/`GUEST`만 전송하면 됨(현재 그대로)
