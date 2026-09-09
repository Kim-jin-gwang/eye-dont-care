# 초대방 생성

URL: /api/v1/waiting-rooms
method: POST
도메인: WaitingRoom
진행상황: 시작 전

# **초대방 생성**

| 항목 | 내용 |
| --- | --- |
| 진행상황 | 시작 전 |
| Method | `POST` |
| URL | `/api/v1/waiting-rooms` |
| 구분 | 필수 |
| 인증 | 필요 |
| 역할 | 공통(회원/게스트) |
| 사용할 페이지 | 로비/대기방 |
| 담당자 |  |
| 도메인 | WaitingRoom |
| 설명 | INVITE 대기방 생성(방장 PLAYER, roomCode CHAR(4)). roomType은 항상 INVITE |

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
| gameName | String(enum) | NOT NULL | 게임 종류. `roomType`·`playMode`는 보내지 않는다(INVITE 고정) |

### **요청 예시**

---

```json
POST /api/v1/waiting-rooms
Authorization: Bearer jwt_token_string
Content-Type: application/json

{
  "gameName": "EYEFIGHT"
}
```

### **Response Elements**

---

| 필드 | 타입 | 필수여부 | 설명 |
| --- | --- | --- | --- |
| roomId | String(UUID) | NOT NULL | 대기방 ID |
| roomType | String(enum) | NOT NULL | `INVITE` |
| gameName | String(enum) | NOT NULL | 게임 종류 |
| roomCode | String(CHAR4) | NOT NULL | 초대 코드 |
| roomStatus | String(enum) | NOT NULL | `WAITING` |
| guestSessionId | String(UUID) | 게스트 한정 | 게스트만. 재사용/신규 발급된 세션 ID |
| guestNickname | String | 게스트 한정 | 게스트만. 표시 닉네임 |

### **응답 예시**

---

### **201 CREATED**

```json
HTTP/1.1 201
Content-Type: application/json;

{
  "code": "WAITING_ROOM_CREATE_SUCCESS",
  "message": "초대방 생성이 완료되었습니다.",
  "data": {
    "roomId": "019abcde-1234-4abc-8def-0123456789ab",
    "roomType": "INVITE",
    "gameName": "EYEFIGHT",
    "roomCode": "A1B2",
    "roomStatus": "WAITING"
  },
}
```

### **400 BAD REQUEST**

```json
HTTP/1.1 400
Content-Type: application/json;

{
  "code": "WAITING-001",
  "message": "지원하지 않는 게임입니다.",
  "data": null,
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

### **503 SERVICE UNAVAILABLE**

```json
HTTP/1.1 503
Content-Type: application/json;

{
  "code": "WAITING-003",
  "message": "대기방을 생성할 수 없습니다.",
  "data": null,
}
```

> 초대 코드 생성 실패 시 `WAITING-002`(503)로 응답한다.
