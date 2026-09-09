# 소모임(커뮤니티) API — 프론트 전달

작성: 백엔드(소모임 담당)
브랜치: `feat/backend-group` (dev 기준) · 전체 테스트 통과
대상: 프론트 커뮤니티 화면 담당

---

## 0. 한 줄 요약

소모임 API **8개**를 만들었고, 응답을 프론트 `CommunityGroup` 모양에 맞췄습니다. 아래 몇 가지만 프론트에서 맞춰주면 바로 연동됩니다. (현재 커뮤니티 화면은 mock이라 아직 연결 안 됨)

---

## 1. 프론트에서 맞춰줄 것 (합의 결과)

| 항목 | 처리 |
| --- | --- |
| **visibility** | 백엔드는 **대문자** `PUBLIC`/`PRIVATE`로 주고받음 → 화면 표시·전송 시 소문자 변환은 프론트에서 |
| **소모임 만들기 폼** | **`joinCode` 입력칸 제거**(코드는 서버 자동 발급), **`activity`(주요 활동) 제거**(이번에 뺌) |
| **image** | 백엔드 미제공 → 프론트에서 기본/랜덤 이미지 사용 |
| **id** | 백엔드는 `groupId`(숫자). 프론트 `CommunityGroup.id`(string)로 쓰려면 `groupId`를 문자열화 |

---

## 2. 엔드포인트 8개 (전부 회원 전용, `Authorization: Bearer {JWT}`)

| Method | URL | 설명 | 성공 code |
| --- | --- | --- | --- |
| POST | `/api/v1/groups` | 소모임 생성(201) | GROUP_CREATE_SUCCESS |
| GET | `/api/v1/groups?keyword=&page=&size=` | 공개 목록·검색 | GROUP_LIST_FOUND |
| GET | `/api/v1/groups/{groupId}` | 상세(+멤버명단) | GROUP_DETAIL_FOUND |
| POST | `/api/v1/groups/join` | 코드 입장 | GROUP_JOIN_SUCCESS |
| GET | `/api/v1/groups/me` | 내 소모임 | MY_GROUP_LIST_FOUND |
| POST | `/api/v1/groups/{groupId}/leave` | 나가기(방장 불가) | GROUP_LEAVE_SUCCESS |
| DELETE | `/api/v1/groups/{groupId}` | 삭제(방장만) | GROUP_DELETE_SUCCESS |
| DELETE | `/api/v1/groups/{groupId}/members/{userId}` | 강퇴(방장만) | GROUP_MEMBER_KICK_SUCCESS |

모든 응답은 공통 껍데기 `{ code, message, data }`.

---

## 3. 공통 응답(소모임 카드) — `CommunityGroup` 대응

생성·입장·목록 항목·내 소모임이 모두 이 모양입니다.

| 백엔드 필드 | 타입 | 프론트 CommunityGroup | 설명 |
| --- | --- | --- | --- |
| groupId | number | id | 소모임 ID |
| name | string | name | |
| description | string\|null | description | |
| members | number | members | 현재 인원 |
| capacity | number | capacity | 정원(기본 50) |
| visibility | `PUBLIC`/`PRIVATE` | visibility(소문자 변환) | |
| leader | string | leader | 방장 닉네임 |
| isOwner | boolean | isOwner | 요청자가 방장인지 |
| isJoined | boolean | isJoined | 요청자가 가입 상태인지 |
| joinCode | string\|null | joinCode | **가입자에게만** 값, 비가입자는 null |
| createdAt | string(ISO) | createdAt | 생성 시각 |

- 없는 필드: `image`, `activity` (프론트 처리 / 제거)
- **상세**는 위 카드 + `memberList: [{ userId, nickname, role(OWNER/MEMBER), joinedAt }]`

### 응답 예시 (생성)
```json
{
  "code": "GROUP_CREATE_SUCCESS",
  "message": "소모임을 생성했습니다.",
  "data": {
    "groupId": 1, "name": "눈운동 모임", "description": "매일 저녁",
    "members": 1, "capacity": 30, "visibility": "PUBLIC",
    "leader": "졸린너구리", "isOwner": true, "isJoined": true,
    "joinCode": "A1B2C3", "createdAt": "2026-08-03T00:00:00Z"
  }
}
```

---

## 4. 요청 바디

- **생성** `POST /groups`
  ```json
  { "name": "눈운동 모임", "description": "매일 저녁", "visibility": "PUBLIC", "capacity": 30 }
  ```
  - `description`·`capacity` 선택. `capacity` 없으면 50. `visibility` 필수(PUBLIC/PRIVATE).
- **입장** `POST /groups/join`
  ```json
  { "groupCode": "A1B2C3" }
  ```

---

## 5. 에러 코드

| code | 상황 | HTTP |
| --- | --- | --- |
| GROUP-001 | 소모임 없음 | 404 |
| GROUP-002 | 유효하지 않은 코드 | 404 |
| GROUP-003 | 정원 초과 | 409 |
| GROUP-004 | 이미 가입 | 409 |
| GROUP-005 | 멤버 아님(나가기) | 403 |
| GROUP-006 | 방장 아님(삭제·강퇴) | 403 |
| GROUP-007 | 방장은 나갈 수 없음 | 409 |
| GROUP-008 | 자기 자신 강퇴 불가 | 409 |
| GROUP-009 | 코드 생성 실패 | 503 |
| GROUP-010 | 강퇴 대상 없음 | 404 |
| COMMON-001 | 입력값 검증 실패(`data.fieldErrors`) | 400 |
| SECURITY-001 | 인증 필요 | 401 |

---

## 6. 규칙 · 주의점

- **회원 전용**: 게스트는 소모임 사용 불가(로그인 필요).
- **joinCode는 가입자에게만** 노출(공개 목록의 비가입 항목은 null).
- **PRIVATE 소모임은 목록·검색에 안 나옴** → 코드 입장 전용.
- **방장은 나가기 불가** → 소모임을 삭제해야 함. 삭제 시 멤버 전원 정리.
- 목록은 페이지네이션(`page` 1부터, `size` 기본 20), `keyword`는 이름 부분검색.

---

## 7. 상태

- 백엔드 구현·테스트 완료(dev 기준 브랜치). 아직 dev에는 미머지, 프론트 화면도 아직 mock.
- 연동 시작하려면: 프론트 커뮤니티 화면의 mock을 위 API로 교체 + 위 "맞춰줄 것" 4가지 반영.
