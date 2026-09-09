# matchmaking Redis 키 설계안

ERD의 `matchmaking_entries`(Redis 관리 영역)와 기능 정의서 3건(랜덤 매칭 신청 / 취소 / 결과 수신)을 근거로 작성했습니다.

## 1. 키 구조

팀 규약 `edc:<profile>:<domain>:<resource>:<identifier>`, 소문자 + `:` 구분을 따릅니다.

| 용도 | 키 | 타입 |
|---|---|---|
| 게임별 매칭 큐 | `edc:dev:matchmaking:queue:hockey` | Sorted Set |
| 참가자 상태 | `edc:dev:matchmaking:entry:user:1` | String (JSON) |
| 참가자 상태 (게스트) | `edc:dev:matchmaking:entry:guest:9f3c…` | String (JSON) |

`participant_key`가 `USER:1` / `GUEST:{uuid}` 형식이라 소문자로 낮추면 그대로 `user:1` / `guest:{uuid}`가 되어 규약의 `:` 구분과 자연스럽게 맞습니다. 별도 변환 규칙이 필요하지 않습니다.

`profile`은 `spring.profiles.active`에서 읽어 주입합니다. dev와 prod가 같은 Redis 인스턴스를 쓰더라도 키가 섞이지 않습니다.

## 2. Sorted Set 큐

```
member = participantKey      (예: USER:1)
score  = queued_at epoch millis
```

기능 정의서의 **"대기 순서가 빠른 두 명"** 이 `score` 오름차순 2명과 정확히 일치합니다. `ZPOPMIN key 2` 한 번으로 끝납니다.

## 3. Entry JSON

ERD 필드를 그대로 옮깁니다.

```json
{
  "participantKey": "USER:1",
  "gameType": "HOCKEY",
  "matchStatus": "SEARCHING",
  "waitingRoomId": null,
  "queuedAt": "2026-07-28T09:00:00Z",
  "statusChangedAt": "2026-07-28T09:00:00Z"
}
```

Hash가 아니라 **단일 JSON 문자열**을 택했습니다.

- 규약이 "JSON/문자열, Java 직렬화 금지"를 명시합니다.
- 상태 전이가 항상 전체 교체(`SEARCHING` → `ENTERING_ROOM`과 `waitingRoomId` 동시 변경)라 부분 갱신이 필요 없습니다.
- 중복 신청 판정이 `SET … NX` 한 번으로 끝납니다.

`Instant`는 ISO 8601 문자열로 직렬화합니다(팀 규약).

## 4. 원자성 — Lua도 락도 필요 없습니다

Redis 기본 명령만으로 모든 경쟁 조건이 해소됩니다. **명령 순서가 핵심입니다.**

### 신청

```
1) ZADD  edc:dev:matchmaking:queue:hockey NX <millis> USER:1
2) SET   edc:dev:matchmaking:entry:user:1 <json> NX EX <ttl>
```

`ZADD`를 **먼저**, `SET`을 나중에 하는 이유입니다.

- `ZADD NX`는 이미 있는 member의 score를 갱신하지 않습니다. → 재신청이 `queued_at`을 덮어쓰는 사고를 원천 차단합니다. 기능 정의서의 **"최초 신청 시각을 `queued_at`으로 기록"** 이 명령 레벨에서 보장됩니다.
- `SET NX` 실패 = 이미 신청한 참가자 → `DUPLICATE_APPLICATION`. 이때 1번의 `ZADD NX`도 아무것도 바꾸지 않았으므로 **롤백할 것이 없습니다.**
- 반대 순서(`SET` 먼저)로 하면 `SET` 성공 후 `ZADD` 실패 시 큐에 없는 유령 entry가 남아 TTL까지 `SEARCHING`에 갇힙니다.

### 성사 (선점)

```
ZPOPMIN edc:dev:matchmaking:queue:hockey 2
```

`ZPOPMIN`은 COUNT 인자를 받는 **단일 원자 명령**입니다. 동시에 두 명이 신청해도 한쪽만 쌍을 얻고, 다른 쪽은 0~1명을 얻어 복원 후 종료합니다. 별도 락이 필요 없습니다.

락을 쓰지 않은 이유가 하나 더 있습니다. 방 생성은 WaitingRoom **외부 호출**입니다. 그 사이 락을 잡고 있으면 상대 도메인 지연이 곧 매칭 전체의 지연이 됩니다.

### 방 생성 실패 시 복원

`ZPOPMIN`은 member와 **score를 함께 반환**합니다. 그 score로 그대로 `ZADD`하면 됩니다.

```
ZADD edc:dev:matchmaking:queue:hockey <원래 score> USER:1
```

기능 정의서의 **"선점을 해제하고 두 참가자의 기존 `queued_at`을 유지한다"** 를 충족합니다. 실패한 참가자가 대기열 맨 뒤로 밀리지 않습니다.

## 5. 유령 member 처리 — 반드시 필요합니다

TTL은 entry 키에만 걸립니다. **Sorted Set member는 만료되지 않습니다.**

따라서 entry가 TTL로 사라진 뒤에도 큐에는 이름이 남습니다. 이 유령을 그대로 매칭하면 존재하지 않는 상대와 방이 만들어집니다.

`ZPOPMIN` 직후 각 후보의 entry 존재를 확인하고, 없으면 버리고 다시 뽑습니다.

```
pop 2 → entry 확인
  둘 다 유효      → 매칭 진행
  하나만 유효      → 유효한 쪽 복원, 종료
  유령 발견        → 버리고 재시도 (횟수 상한 필요)
```

재시도 상한을 두지 않으면 큐가 유령으로 가득할 때 무한 루프에 빠집니다.

## 6. TTL — 명세 충돌을 확인해주세요

기능 정의서에 상충하는 문장이 있습니다.

> 랜덤 매칭 신청: "매칭 대기시간에는 **제한을 두지 않는다**"
> 랜덤 매칭 취소: "새로고침·브라우저 종료·네트워크 끊김 → 서버가 WebSocket 연결 종료나 **TTL로 자동 정리**"

두 문장은 사실 모순이 아니라 **역할이 다릅니다.**

- 앞 문장 = 매칭 성사에 시간 제한 없음 (오래 기다려도 큐에서 안 빼냄)
- 뒷 문장 = 유실된 참가자 청소용 안전망

다만 TTL이 짧으면 앞 문장을 위반합니다. 이번 단계는 WebSocket이 없어 연결 종료를 감지할 수 없으니 **TTL이 유일한 청소 수단**입니다.

`app.matchmaking.entry-ttl`로 설정값으로 빼고 기본 **30분**을 제안합니다. WebSocket 브랜치에서 연결 종료 감지가 붙으면 TTL을 늘리거나 없앨 수 있습니다.

## 7. WaitingRoom 연동 인터페이스

`waitingroom` 패키지에 둡니다(팀 규약: 다른 도메인 Repository 직접 호출 금지).

```java
public interface RandomRoomCreator {
    Optional<UUID> createRandomRoom(GameName gameType, List<String> participantKeys);
}
```

`Optional`이 비면 실패 → 선점 해제. 예외가 아니라 반환값으로 표현한 이유는 기능 정의서가 방 생성 실패를 **정상 흐름의 분기**로 규정하기 때문입니다.

임시 구현체를 두고 담당자가 교체합니다. 스텁으로 성공/실패 양쪽을 다 테스트할 수 있습니다.

## 8. 미해결 — 팀 확인이 필요한 사항

### game_type과 game_id의 불일치

matchmaking과 waitingroom은 `game_type`(VARCHAR, 게임 이름)만 다룹니다. 반면 gameResult 제출에는 `game_id`가 필요하고, 이는 (`game_name`, `play_mode`, `difficulty`) 조합입니다.

랜덤 매칭은 난이도를 선택하지 않으므로 `(HOCKEY, RANDOM, NULL)` 행으로 매핑되는 것이 자연스럽고, 시드 데이터가 이미 그렇게 구성돼 있습니다. **경기 종료 후 `game_id`를 결정하는 책임이 누구인지가 명세에 없습니다.**

### IN_WAITING_ROOM 전이 주체

ERD의 `match_status`는 `SEARCHING` / `ENTERING_ROOM` / `IN_WAITING_ROOM` 세 값입니다. 앞의 두 전이는 matchmaking이 담당하지만, `IN_WAITING_ROOM`은 "대기방 실시간 연결" 명세의 **"RANDOM 방은 매칭 성사 후 10초 이내에 연결되어야 하며, 연결 성공을 입장 확인으로 사용한다"** 에 해당합니다. 즉 **WaitingRoom의 WebSocket 연결 성공이 트리거**입니다.

matchmaking이 이 전이를 위한 메서드를 공개해야 합니다. 이번 브랜치에서 인터페이스만 열어둘지, WebSocket 브랜치로 미룰지 정해야 합니다.

### 10초 미연결 시 처리

같은 명세의 10초 제한을 넘겼을 때 `ENTERING_ROOM` 참가자를 어떻게 할지가 없습니다. 큐로 되돌릴지, 그냥 정리할지 결정이 필요합니다. WebSocket 없이는 감지 자체가 불가능하므로 다음 브랜치 과제입니다.
