# 초대방 입장

URL: /api/v1/waiting-rooms/join
method: POST
도메인: WaitingRoom
진행상황: 시작 전

# **초대방 입장**

| 항목 | 내용 |
| --- | --- |
| 진행상황 | 시작 전 |
| Method | `POST` |
| URL | `/api/v1/waiting-rooms/join` |
| 구분 | 필수 |
| 인증 | 필요 |
| 역할 | 공통(회원/게스트) |
| 사용할 페이지 | 로비/대기방 |
| 담당자 |  |
| 도메인 | WaitingRoom |
| 설명 | 방 코드로 INVITE 대기방 참여 |

### **Request Header**

---

| 파라미터 | 타입 | 필수여부 | 설명 |
| --- | --- | --- | --- |
| Authorization | String | 조건부 | 회원: JWT 액세스 토큰(Bearer) |
| X-Guest-Session-Id | String(UUID) | 조건부 | 게스트: 기존 세션 ID. 없으면 서버가 발급 |
| Content-Type | String | 필수 | application/json |

### **Role Requirement**

---

**권한:** 인증된 회원 또는 게스트가 요청할 수 있습니다.

### **Request Elements**

---

| 파라미터 | 타입 | 필수여부 | 설명 |
| --- | --- | --- | --- |
| roomCode | String(CHAR4) | NOT NULL | 입장할 방 코드 |

### **요청 예시**

---

```json
POST /api/v1/waiting-rooms/join
Authorization: Bearer jwt_token_string
Content-Type: application/json

{
  "roomCode": "A1B2"
}
```

### **Response Elements**

---

| 필드 | 타입 | 필수여부 | 설명 |
| --- | --- | --- | --- |
| roomId | String(UUID) | NOT NULL | 대기방 ID |
| roomType | String(enum) | NOT NULL | `INVITE` |
| gameName | String(enum) | NOT NULL | 게임 종류 |
| roomCode | String(CHAR4) | NOT NULL | 방 코드 |
| roomStatus | String(enum) | NOT NULL | `WAITING` / `COUNTDOWN` / `IN_GAME` / `CLOSED` |
| participants | Array | NOT NULL | 각 원소 {participantKey, displayName, roomRole(`HOST`/`PLAYER`), slotNo(int), isReady(bool), calibrationStatus(`PENDING`/`IN_PROGRESS`/`COMPLETED`), joinedAt} |
| guestSessionId | String(UUID) | 게스트 한정 | 게스트만 |
| guestNickname | String | 게스트 한정 | 게스트만 |

### **응답 예시**

---

### **200 OK**

```json
HTTP/1.1 200
Content-Type: application/json;

{
  "code": "WAITING_ROOM_JOIN_SUCCESS",
  "message": "초대방 입장이 완료되었습니다.",
  "data": {
    "roomId": "019abcde-1234-4abc-8def-0123456789ab",
    "roomType": "INVITE",
    "gameName": "EYEFIGHT",
    "roomCode": "A1B2",
    "roomStatus": "WAITING",
    "participants": [
      { "participantKey": "USER:1", "displayName": "방장", "roomRole": "HOST", "slotNo": 1, "isReady": false, "calibrationStatus": "PENDING", "joinedAt": "2026-07-31T10:00:00Z" },
      { "participantKey": "GUEST:019abcde-...", "displayName": "졸린너구리", "roomRole": "PLAYER", "slotNo": 2, "isReady": false, "calibrationStatus": "PENDING", "joinedAt": "2026-07-31T10:01:00Z" }
    ]
  },
}
```

### **401 UNAUTHORIZED**

```json
HTTP/1.1 401
Content-Type: application/json;

{
  "code": "SECURITY-001",
  "message": "인증이 필요합니다.",
  "data": null,
}
```

### **404 NOT FOUND**

```json
HTTP/1.1 404
Content-Type: application/json;

{
  "code": "WAITING-004",
  "message": "유효하지 않은 초대 코드입니다.",
  "data": null,
}
```

### **409 CONFLICT**

```json
HTTP/1.1 409
Content-Type: application/json;

{
  "code": "WAITING-005",
  "message": "대기방 정원이 가득 찼습니다.",
  "data": null,
}
```

> 그 밖의 409: `WAITING-006`(이미 참여 중), `WAITING-007`(현재 입장할 수 없는 대기방).
