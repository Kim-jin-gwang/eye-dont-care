# 게임 결과 제출

URL: /api/v1/game-results
method: POST
도메인: GameResult
진행상황: 시작 전

# **게임 결과 제출**

| 항목 | 내용 |
| --- | --- |
| 진행상황 | 시작 전 |
| Method | `POST` |
| URL | `/api/v1/game-results` |
| 구분 | 필수 |
| 인증 | 필요 |
| 역할 | 공통(회원/게스트) |
| 사용할 페이지 | 게임 결과 |
| 담당자 |  |
| 도메인 | GameResult |
| 설명 | 게임 종료 후 프론트 계산 결과 제출(멱등키 playId, 나가기=FORFEIT) |

### **Request Header**

---

| 파라미터 | 타입 | 필수여부 | 설명 |
| --- | --- | --- | --- |
| Authorization | String | 조건부 | 회원: JWT 액세스 토큰(Bearer) |
| X-Guest-Session-Id | String(UUID) | 조건부 | 게스트: 발급받은 세션 ID. 제출자는 participants에도 포함되어야 함 |
| Content-Type | String | 필수 | application/json |

### **Role Requirement**

---

**권한:** 경기 참가자가 요청합니다.

### **Request Elements**

---

| 파라미터 | 타입 | 필수여부 | 설명 |
| --- | --- | --- | --- |
| playId | String(UUID) | NOT NULL | 클라 생성 멱등키 |
| gameId | Long | NOT NULL | 게임 ID (gameName+playMode+difficulty 조합, `playMode`는 별도로 보내지 않음) |
| startedAt | String(ISO-8601) | NOT NULL | 경기 시작 시각 |
| endedAt | String(ISO-8601) | NOT NULL | 경기 종료 시각 |
| participants | Array | NOT NULL | 아래 participants[] 참고 |
| participants[].participantKey | String | NOT NULL | `USER:{userId}` / `GUEST:{uuid}` (AI는 형식 제약 없음) |
| participants[].participantType | String(enum) | NOT NULL | `USER` / `GUEST` / `AI` |
| participants[].slotNo | Integer | NOT NULL | 참가자 슬롯 번호(1부터) |
| participants[].displayName | String | NOT NULL | 표시 이름. **게스트는 요청값 무시, 검증된 세션 닉네임으로 저장** |
| participants[].outcome | String(enum) | NOT NULL | `WIN` / `LOSE` / `DRAW` / `FORFEIT` / `COMPLETED`(솔로 등 승패 없는 완주) |
| participants[].rank | Integer | NOT NULL | 최종 순위(1부터) |
| gameResult | Object(JSONB) | NOT NULL | 게임별 상세(JSONB 스키마). 대표 점수는 이 안에 담김 |

### **요청 예시**

---

```json
POST /api/v1/game-results
Authorization: Bearer jwt_token_string    // 회원. 게스트는 X-Guest-Session-Id 헤더 사용
Content-Type: application/json

{
  "playId": "019abcde-1234-4abc-8def-0123456789ab",
  "gameId": 1,
  "startedAt": "2026-07-30T09:00:00Z",
  "endedAt": "2026-07-30T09:01:00Z",
  "participants": [
    {
      "participantKey": "USER:1",
      "participantType": "USER",
      "slotNo": 1,
      "displayName": "회원",
      "outcome": "WIN",
      "rank": 1
    },
    {
      "participantKey": "GUEST:019abcde-5678-4abc-8def-0123456789ab",
      "participantType": "GUEST",
      "slotNo": 2,
      "displayName": "졸린너구리",
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

### **Response Elements**

---

| 필드 | 타입 | 필수여부 | 설명 |
| --- | --- | --- | --- |
| resultId | Long | NOT NULL | 저장된 경기 결과 ID |
| isNewRecord | Boolean | NOT NULL | 개인 최고 기록 갱신 여부(서버 판정). 아래 *신기록 판정 규칙* 참고 |
| previousBestScore | Long | NULL 허용 | 직전 개인 최고 점수. 이전 기록이 없으면 `null` |

> **신기록 판정 규칙**
> - **회원 + 이번 결과에 점수 있음** 인 경우만 판정. 그 외(게스트·점수 없음)는 `isNewRecord=false`, `previousBestScore=null`.
> - 같은 **게임(gameId, 즉 모드·난이도 단위)** 의 이전 개인 최고 점수와 비교한다.
> - 이전 기록이 없으면 `true`. 있으면 이번 점수가 **엄격히 클 때만** `true`(**동점은 false**).
> - 저장 직전 시점 기준으로 판정하며, 이번 결과는 비교 대상에 포함되지 않는다.
> - 점수는 `gameResult`의 해당 슬롯 `score`를 사용한다(예: 솔로는 `gameResult["1"].score`).
> - "신기록"처럼 확정적으로 표시하는 값은 새로고침·다른 기기·동시 저장에서도 일관되도록 서버가 판정한다.

### **응답 예시**

---

### **201 CREATED**

```json
HTTP/1.1 201
Content-Type: application/json;

{
  "code": "RESULT_SUBMITTED",
  "message": "게임 결과가 저장되었습니다.",
  "data": {
    "resultId": 5001,
    "isNewRecord": true,
    "previousBestScore": 310
  },
}
```

### **400 BAD REQUEST**

```json
HTTP/1.1 400
Content-Type: application/json;

{
  "code": "GAMERESULT-003",
  "message": "참가자 정보가 올바르지 않습니다.",
  "data": null,
}
```

> 그 밖의 400: `GAMERESULT-004`(경기 참가자만 제출 가능), `GAMERESULT-005`(경기 시작/종료 시각 오류).

### **401 UNAUTHORIZED**

```json
HTTP/1.1 401
Content-Type: application/json;

{
  "code": "SECURITY-002",
  "message": "유효하지 않은 액세스 토큰입니다.",
  "data": null,
}
```

> 게스트 세션이 만료·위조되었으면 `GUEST-001`(401, "유효하지 않은 게스트 세션입니다.")로 응답하며, 결과·참가자 저장은 전체 롤백된다.

### **404 NOT FOUND**

```json
HTTP/1.1 404
Content-Type: application/json;

{
  "code": "GAMERESULT-002",
  "message": "게임을 찾을 수 없습니다.",
  "data": null,
}
```

### **409 CONFLICT**

```json
HTTP/1.1 409
Content-Type: application/json;

{
  "code": "GAMERESULT-001",
  "message": "이미 제출된 결과입니다.",
  "data": null,
}
```

### **500 INTERNAL SERVER ERROR**

```json
HTTP/1.1 500
Content-Type: application/json;

  "code": "UNEXPECTED_SERVER_ERROR",
  "message": "예상하지 못한 서버 오류가 발생했습니다.",
  "data": null,
}
```