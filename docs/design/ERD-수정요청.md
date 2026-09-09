# ERD 수정 요청 — 매칭/게임/대기방

작성: matchmaking / game / gameResult 담당
대상: ERD 관리 담당
기준: `feat/backend` 최신 구현

---

## 요약

최신 ERD를 구현과 대조한 결과, **`matchmaking_entries` 테이블에 3가지 수정**이 남았습니다. (나머지 `play_mode`·`room_status`는 이미 반영 완료 — 감사합니다.)

---

## ✅ 이미 반영된 것

- `games.play_mode` = `SOLO / INVITE / RANDOM / AI` — 반영 완료
- `waiting_rooms.room_status` = `WAITING / COUNTDOWN / IN_GAME / CLOSED` — 반영 완료

## ❗ 남은 수정 — `matchmaking_entries` 테이블

### 1. `match_status` — 값 추가 (중요)

- **현재(ERD):** `SEARCHING / ENTERING_ROOM / IN_WAITING_ROOM / CANCELLED`
- **변경:** **`MATCHING` 추가** → `SEARCHING / MATCHING / ENTERING_ROOM / IN_WAITING_ROOM / CANCELLED`
- **이유:** 두 사람을 방으로 확정하기 직전 "선점(예약) 중" 상태가 필요해서 `MATCHING`을 추가함. 인수인계 §6의 "선점 중에 해당하는 값이 없다"가 이걸로 해결됨.

### 2. 첫 컬럼명 `Field` → `participant_key`

- **현재(ERD):** 맨 윗줄(참가자 키) 컬럼명이 템플릿 placeholder `Field` 그대로임.
- **변경:** 컬럼명을 `participant_key`로 채움. (타입/설명 VARCHAR(50), `USER:{...}/GUEST:{...}`는 그대로 맞음)

### 3. `match_attempt_id` 컬럼 추가 (선택)

- **현재(ERD):** 없음.
- **변경:** `match_attempt_id VARCHAR(36)` 추가 권장.
- **이유:** 예약(선점) 매칭에서 같은 시도인지 검증하려고 실제로 저장하는 필드. Redis 관리라 생략해도 동작엔 무방하나, ERD에 있으면 선점 흐름이 정확히 드러남.

---

## 참고 — 어긋나지 않은 것 (확인용)

- `waiting_room_participants.calibration_status` = `PENDING / IN_PROGRESS / COMPLETED` ✅
- `waiting_rooms.room_type` = `INVITE / RANDOM` ✅
- `guest_sessions`, `games_results`, `participants` 등 나머지 구현과 일치 ✅

---

`matchmaking_entries` 3곳(match_status에 MATCHING, Field→participant_key, match_attempt_id)만 반영되면 매칭/게임/대기방 도메인 ERD는 구현과 완전히 일치합니다.
