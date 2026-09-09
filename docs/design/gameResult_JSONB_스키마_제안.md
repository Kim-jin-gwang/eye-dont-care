# gameResult JSONB 스키마 제안

`POST /api/v1/game-results`의 `gameResult` 필드 구조 제안입니다.
프론트엔드가 계산한 값을 그대로 담아 보내고, 서버는 `games_results.game_result` 컬럼에 JSONB로 저장합니다.

> 논의용 초안입니다. 확정되면 API 명세서에 반영하고 이 문서는 폐기합니다.

---

## 배경 — 명세서 불일치

현재 API 명세서에서 같은 필드가 두 가지 모양으로 나옵니다.

**게임 결과 제출** — 평평한 구조

```json
"gameResult": { "durationMs": 15200, "totalRounds": 8 }
```

**내 경기 기록 상세 조회** — 슬롯 번호로 감싼 구조

```json
"gameResult": { "1": { "survivalTimeMs": 180000 } }
```

저장과 조회가 같은 컬럼이므로 한쪽으로 통일해야 합니다.

---

## 공통 구조

```json
{
  "durationMs": 62000,
  "players": [
    { "slotNo": 1, "...": "게임별 필드" },
    { "slotNo": 2, "...": "게임별 필드" }
  ]
}
```

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `durationMs` | int | 필수 | 경기 실제 소요 시간(ms) |
| `players` | Array | 필수 | 참가자별 상세. `slotNo`로 최상위 `participants`와 연결 |
| `players[].slotNo` | int | 필수 | 참가자 슬롯 번호 |

`players`를 배열로 둔 이유는 최상위 `participants`가 배열이라 구조를 맞추기 위함입니다.
`slotNo`가 두 배열을 잇는 키가 됩니다.

### 최상위 `score`와의 관계

`participants[].score`는 **랭킹에 쓰이는 대표 점수 하나**입니다.
`gameResult`는 그 점수가 어떻게 나왔는지에 대한 상세입니다.

값이 일부 중복되지만 의도한 것입니다. 랭킹 조회할 때마다 JSONB를 파싱하지 않기 위해서입니다.

| 게임 | `participants[].score`에 담을 값 |
| --- | --- |
| `HOCKEY` | 골 수 |
| `EYEFIGHT` | 생존 시간(ms) |
| `DRAWING` | 라운드 점수 총합 |
| `RHYTHM` | 최종 점수 |
| `BLINK` | 깜빡임 횟수 |

---

## 게임별 스키마

### HOCKEY (에어하키)

골 1개 = 1점, 제한 시간 1분, 난이도 없음.

```json
{
  "durationMs": 60000,
  "players": [
    { "slotNo": 1, "goals": 5 },
    { "slotNo": 2, "goals": 3 }
  ]
}
```

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `goals` | int | 넣은 골 수 |

랭킹은 랜덤 매칭 **승리 횟수** 기준입니다. `participants[].outcome`이 `WIN`인 건수를 세면 되므로
`gameResult`에 별도 필드가 필요 없습니다.

### EYEFIGHT (눈싸움)

먼저 눈을 감으면 패배. 경기 시간은 먼저 눈을 감은 사람의 시간.

```json
{
  "durationMs": 18400,
  "players": [
    { "slotNo": 1, "survivalTimeMs": 18400, "blinkedFirst": false },
    { "slotNo": 2, "survivalTimeMs": 18400, "blinkedFirst": true }
  ]
}
```

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `survivalTimeMs` | int | 눈을 뜨고 버틴 시간(ms) |
| `blinkedFirst` | boolean | 먼저 눈을 감았는지 |

혼자하기 모드는 `players`에 1명만 담습니다. 랭킹은 이 모드의 `survivalTimeMs` 기준입니다.

AI 대결은 난이도별 제한 시간이 다릅니다(easy 15초 / normal 30초 / hard 1분).
난이도는 `gameId`가 이미 담고 있으므로 `gameResult`에 넣지 않습니다.

### DRAWING (그림 그리기)

제한 100초, 3라운드, 라운드가 올라갈수록 제시어 난이도 상승. AI가 채점.

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

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `totalScore` | int | 라운드 점수 총합. 랭킹 기준 |
| `rounds[].round` | int | 라운드 번호 (1~3) |
| `rounds[].word` | String | 제시어 |
| `rounds[].wordLevel` | int | 제시어 난이도. 같은 난이도는 동일 점수 |
| `rounds[].correct` | boolean | AI가 맞췄는지 |
| `rounds[].baseScore` | int | 정답 시 기본 100점 |
| `rounds[].timeBonus` | int | 남은 시간 보너스 |
| `rounds[].confidence` | double | AI 확신도 (0.0 ~ 1.0) |
| `rounds[].confidenceBonus` | int | 확신도에 따른 보너스 |
| `rounds[].score` | int | 해당 라운드 점수 |

`confidence`를 원본 값 그대로 남기면 나중에 보너스 계산식을 바꿔도 과거 기록을 재계산할 수 있습니다.

### RHYTHM (리듬 게임)

30초, 왼눈·오른눈·양눈으로 박자 맞추기. 하트 5개, 콤보 10부터 보너스.

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

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `trackId` | String | 사용한 곡. 곡이 늘어날 때를 대비 |
| `totalScore` | int | 최종 점수. 랭킹 기준 |
| `baseScore` | int | 기본 점수 |
| `comboBonus` | int | 콤보 보너스 |
| `heartBonus` | int | 남은 하트 보너스 |
| `maxCombo` | int | 최대 콤보 |
| `heartsLeft` | int | 남은 하트 (0~5) |
| `hitCount` / `missCount` | int | 성공·실패 횟수 |

난이도는 삭제되었으므로 필드를 두지 않습니다.

### BLINK (눈 깜빡이기)

20초 동안 많이 깜빡이기. 친구 대결과 랜덤 매칭에만 랜덤 이벤트.

```json
{
  "durationMs": 20000,
  "players": [
    { "slotNo": 1, "blinkCount": 98, "eventTriggered": true, "eventBonus": 15 },
    { "slotNo": 2, "blinkCount": 87, "eventTriggered": false, "eventBonus": 0 }
  ]
}
```

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `blinkCount` | int | 깜빡인 횟수. 랭킹 기준 |
| `eventTriggered` | boolean | 랜덤 이벤트 발동 여부 |
| `eventBonus` | int | 이벤트 보너스. 미발동 시 0 |

혼자하기 모드에는 이벤트가 없으므로 `eventTriggered`는 항상 `false`입니다.

---

## 몰수(FORFEIT) 처리

나가기 버튼을 누르면 그 시점까지의 결과가 제출됩니다.

- `participants[].outcome`을 `FORFEIT`으로 설정
- `gameResult`는 **중단 시점까지의 값을 그대로** 담습니다
- `durationMs`는 실제 진행된 시간

새로고침·탭 종료·네트워크 단절은 결과를 저장하지 않습니다.

---

## 결정이 필요한 항목

1. `players`를 배열로 할지, 명세서처럼 `slotNo`를 키로 하는 객체로 할지
2. `EYEFIGHT`의 `participants[].score`를 ms로 할지 초로 할지 (랭킹 표시는 초 단위)
3. 서버가 이 스키마를 검증할지, JSONB로 저장만 할지
4. `DRAWING`의 `word`(제시어)를 저장하는 것이 문제 없는지

---

## 참고

- 최상위 요청 형식(`playId`, `gameId`, `playMode`, `participants`)은 API 명세서를 따릅니다.
- 이 스키마는 `games_results.game_result` 컬럼 하나에 저장됩니다. ERD 변경은 없습니다.
