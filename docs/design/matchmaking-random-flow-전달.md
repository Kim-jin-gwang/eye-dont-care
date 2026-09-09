# Matchmaking RANDOM 연동 완료 — 전달사항

작성: matchmaking / game / gameResult 담당
대상: WaitingRoom 담당자(주), 백엔드·프론트 공통(참고)
기준 브랜치: `feat/backend` (본 작업 머지 완료, commit `1dc3e6d`)

---

## 1. 오늘 작업한 내용 (완료)

WaitingRoom RANDOM 협업 핸드오프(§17)에 맞춰 Matchmaking 쪽을 구현하고 `feat/backend`에 머지했습니다.

커밋 4개:

| 커밋 | 내용 |
| --- | --- |
| `e00621e` | 예약(`MATCHING`) 상태 + `matchAttemptId` 모델, 리포지토리 원자 선점/finalize/보상 |
| `1bfda91` | 서비스 예약 기반 매칭 확정 + 실패 보상 |
| `fa91017` | WaitingRoom lifecycle 어댑터(입장→IN_WAITING_ROOM, 완료→compare-delete) |
| `d02b0ea` | `/ws/match` old-session close race 수정 |

전체 테스트 515개 통과.

핸드오프 §17 필수 항목 대조:

- 매칭 확정: `MATCHING`+`matchAttemptId` 예약 → `RandomRoomCreator` 호출 → 같은 attempt 재검증 후 `ENTERING_ROOM` 확정 → `MATCH_SUCCESS` 전송
- 실패 보상: `Optional.empty()`와 호출 예외 모두 실패 처리 / USER·GUEST 유효성 재검증 / 현재 시각 기준 재등록(기존 대기 순서 폐기) / 무효 참가자 정리 / stale `matchAttemptId` 차단
- lifecycle adapter: `RandomRoomLifecyclePort` 구현(@Component) / roomId 멱등 / IN_GAME compare-delete / 다른 roomId entry 보호
- WebSocket: `MATCH_SUCCESS` 후 소켓 유지 / old-session close가 새 매칭을 취소하지 않도록 compare-remove

합의 반영: 방 생성 성공 후 finalize 실패 시 → cleanup port 없이 **TTL 10분 만료 + 참가자 현재시각 재등록 + WARN 로그**.

---

## 2. WaitingRoom 담당자에게

### 그대로 유지한 계약

- `RandomRoomCreator` 시그니처 그대로 사용 (`Optional<UUID> createRandomRoom(GameName, List<String>)`)
- `participantKeys.get(0)→slotNo=1`, `get(1)→slotNo=2` 순서 보존
- `RandomRoomLifecyclePort` 두 메서드 그대로 구현 (`void`, roomId 비교, 멱등)
- lifecycle 부재·예외가 WaitingRoom 상태를 rollback하지 않는 전제 유지

### 합의 결과 (중요)

- **finalize 실패 cleanup port는 추가하지 않기로 함.** → WaitingRoom에 `cleanupRandomRoom` 구현 불필요.
- orphan RANDOM room은 TTL 10분 만료에 위임. Matchmaking이 참가자만 현재시각 재등록.

### 함께 확인해야 할 것 (핸드오프 §13 · §19)

아직 **크로스 도메인 통합 테스트가 없습니다.** 아래를 양쪽 풀 컨텍스트로 함께 검증 필요:

- WaitingRoom optional provider가 Matchmaking 어댑터 bean(`MatchmakingRandomRoomLifecycleAdapter`)을 실제로 탐지하는지 (fallback WARN 안 뜨는지)
- 실제 흐름: 매칭 → 방 생성 → 입장 → `IN_WAITING_ROOM` → COUNTDOWN → IN_GAME → Matchmaking entry compare-delete → GAME_START
- 같은 roomId 중복 lifecycle 호출 멱등 / 다른 roomId entry 미변경

### 다음(재매칭) 후속

- WaitingRoom `feat/backend-waiting-room-random-rematch`가 이미 머지된 것을 확인했습니다.
- 핸드오프 §16·§21의 자동 재매칭(`RandomRematchRequester`, `MATCH_REQUEUED`/`MATCH_ERROR`)은 Matchmaking 쪽 후속이 필요합니다. **해당 계약 확정 문서를 주시면** 이번과 동일한 방식(현재시각 재등록, `/ws/match` 전송)으로 붙이겠습니다.

---

## 3. 그 외 알면 좋을 내용 (백엔드·프론트 공통)

### 배포 블로커 (dev/인프라 담당)

- `application-prod.yml`이 `app.cors.allowed-origins: ${APP_CORS_ALLOWED_ORIGINS}`(기본값 없음)를 요구하는데, `compose.prod.yml` backend env에 **이 변수가 없습니다.** → prod로 띄우면 필수 프로퍼티 부재로 **기동 실패.** 배포 전 반드시 주입 필요. (인수인계 §5.1 미해결)

### 프론트 연동 규약

- **게스트 순서**: 게스트 세션 발급 전용 API 없음. 게스트는 **매칭 신청(또는 초대방 입장)이 첫 요청**이어야 세션이 생기며, 응답의 `guestSessionId`를 저장해 이후 요청·WS에 **헤더 `X-Guest-Session-Id`**로 재사용.
- **WebSocket 첫 프레임 인증**: `/ws/match`·`/ws/waiting-rooms/{roomId}` 연결 직후 첫 메시지로 인증 프레임 전송 필요.
  - 회원 `{ "type": "AUTH", "accessToken": "{JWT}" }`
  - 게스트 `{ "type": "AUTH", "guestSessionId": "{uuid}" }`
  - 미전송 시 서버가 연결 종료.
- **응답 형태**: 공통 껍데기 `{ code, message, data }`. 성공 code는 단어형(`MATCH_QUEUED` 등), 오류 code는 `DOMAIN-NUMBER`(`MATCHMAKING-002`, `AUTH-003`, `SECURITY-001` 등). 검증 오류는 `data.fieldErrors: [{ field, reason }]`.
- **CORS(dev)**: `http://localhost:5173`만 허용. 프론트 개발 서버 주소가 다르면 `application-dev.yml`에 추가 필요.

### 명세 ↔ 구현 차이 (프론트가 옛 명세 보면 혼동)

- API 명세서는 현재 구현 기준으로 정정 완료(matchmaking/game/gameResult/auth/user).
- 단, 명세 원안엔 있으나 **현재 미구현**인 필드가 있음: 회원가입/로그인 응답 `tokenType`, 소셜 로그인 `isNewUser`·`provider` 일반화, 게임 상세 `rule/thumbnail/playModes[]/난이도목록`. 필요하면 별도 구현 협의.

### 미결·후속 (matchmaking/game 담당)

- **눈싸움(EYEFIGHT) AI 모드 제거 미적용**: `data.sql`에 `EYEFIGHT AI 1/2/3` 3행 유지 중(게임 16개). 제거 결정됐으나 아직 미반영 → 프론트 게임 카드에 노출됨.
- **`game_id` ↔ `game_type` 미합의**(인수인계 §6): 매칭·대기방은 `gameType`만, 게임 결과 제출은 `gameId`(게임+모드+난이도) 필요. 랜덤 매칭은 `(게임, RANDOM, null)` 행으로 매핑되나, **경기 종료 후 gameId를 누가 결정하는지** 규약 없음 → 프론트/gameResult 담당과 합의 필요.
- **ERD**: `games.play_mode`가 `SOLO/MULTI/AI`로 스테일. 실제는 `SOLO/INVITE/RANDOM/AI` → 다이어그램 갱신 필요.

---

## 4. 요약

- Matchmaking RANDOM 정상 흐름 연동 **완료·머지**.
- WaitingRoom: cleanup port 불필요(TTL 합의), 크로스 E2E만 함께 확인. 재매칭 후속 계약 문서 대기.
- 배포 전 **prod CORS 주입** 필수.
- 프론트: 게스트 순서 / WS 첫 프레임 / 에러 형태 규약 반영 필요.
