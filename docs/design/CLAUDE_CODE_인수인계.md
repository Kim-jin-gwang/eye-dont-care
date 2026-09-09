# Claude Code 인수인계 — 백엔드 (matchmaking / game / gameResult)

이 문서는 Cowork 세션에서 진행한 작업을 Claude Code로 이어가기 위한 인수인계다.

**사용법**: Claude Code를 `eye-dont-care`에서 실행한 뒤 이 문서 내용을 첫 메시지로 붙이거나,
`이 파일 읽고 이어서 작업해줘` 로 경로를 알려주면 된다.

`CLAUDE.md`, `AGENTS.md`, `docs/`, `.claude/skills/` 는 Claude Code가 알아서 읽으므로 여기서 반복하지 않는다.
**이 문서에는 그 문서들에 없는, 세션 중 내려진 결정만 담았다.**

---

## 1. 담당 범위와 진행 상황

담당은 **matchmaking, game, gameResult** 세 API다.

| 도메인 | 상태 |
|---|---|
| game | 완료 (목록/상세 조회) |
| gameResult | 완료 (제출, 내 기록 목록, 내 기록 상세) |
| matchmaking | REST 완료 (신청/취소). **WebSocket 미완** |

작업 브랜치는 전부 `feat/backend`로 머지했다. `feat/backend`는 `origin/dev`보다 4커밋 뒤처져 있다
(Jenkins 파이프라인, Docker Compose 환경, 프론트 Docker 이미지). 한 번 받아둔 상태이나
머지 이후 다시 벌어졌는지는 `git fetch` 후 확인이 필요하다.

전체 테스트 **115개 통과** (마지막 확인 시점). 실행 전 Redis·PostgreSQL 컨테이너가 필요하다.

```bash
cd eye-dont-care
docker compose -f compose.dev.yml up -d postgres redis
cd backend && ./gradlew.bat clean test
```

---

## 2. 작업 방식 (유지할 것)

- **TDD 엄수.** 테스트 작성 → RED를 *예상한 이유로* 확인 → 구현. 팀 문서 요구사항이다.
- 테스트 개수는 예측하지 말고 `backend/build/test-results/test/*.xml`을 읽어서 집계한다.
  (세션 중 개수를 두 번 잘못 예측했다.)
- **Mockito를 쓰지 않는다.** 저장소에 의존성이 없다. 컨트롤러 테스트는
  `MockMvcBuilders.standaloneSetup()` + 손으로 만든 서비스 하위 클래스 스텁으로 작성한다.
- `standaloneSetup`에는 Validator가 없다. `@RequestParam`의 Bean Validation을 검증하려면
  `.setValidator(new LocalValidatorFactoryBean())`을 직접 넣어야 한다.
- 커밋 메시지는 Conventional Commits, **영어, 50자 이내, 본문 없음**. 히스토리 24개 중 본문이 있는 건 1개뿐이다.
- GitLab이므로 PR이 아니라 **MR**이다. `.gitlab-ci.yml`이 없어 **MR에서 테스트가 자동 실행되지 않는다.**
  `.github/PULL_REQUEST_TEMPLATE/`는 GitLab이 읽지 않으므로 템플릿은 수동으로 붙여야 한다.
- 자바 파일은 **탭 인덴트**다. `.editorconfig`는 space/4라고 적혀 있으나 실제 코드는 전부 탭이다.
  (충돌 사항으로 보고했고, 기존 코드를 따르기로 했다.)

---

## 3. Spring Boot 4.1 관련 — 짐작하면 빌드가 깨진다

Boot 4에서 이름이 대거 바뀌었다. 세션 중 Maven Central과 javadoc으로 **직접 확인한** 것들이다.

| 항목 | Boot 4.1 값 |
|---|---|
| 테스트 슬라이스 (JPA) | `org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest` |
| 테스트 슬라이스 (Redis) | `org.springframework.boot.data.redis.test.autoconfigure.DataRedisTest` |
| 테스트 슬라이스 (MVC) | `org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest` |
| 테스트 DB 설정 | `org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase` |
| 엔티티 스캔 | `org.springframework.boot.persistence.autoconfigure.EntityScan` |
| Redis 자동설정 | `DataRedisAutoConfiguration` (`RedisAutoConfiguration` 아님) |
| Redis 프로퍼티 접두어 | `spring.data.redis` (유지) |
| Redis 테스트 스타터 | `spring-boot-starter-data-redis-test` |
| WebSocket 스타터 | `spring-boot-starter-websocket` (존재 확인함, 아직 미추가) |

**Jackson 3을 쓴다.** `tools.jackson.core:jackson-databind:3.1.4`이고 자동설정이
`tools.jackson.databind.json.JsonMapper`를 기준으로 동작한다. 애노테이션은
`com.fasterxml.jackson.annotation.*`이 그대로 통한다(`ApiResponse`가 `@JsonInclude`를 쓰고 있다).

Redis 값 직렬화에 Jackson을 끌어오지 않은 이유가 이것이다. 필요해지면 날짜 모듈 기본 등록 여부부터 확인해야 한다.

---

## 4. 문서에 없는 결정들

### 4.1 응답 / 오류 코드

- 오류 코드는 팀 규약 `<DOMAIN>-<NUMBER>`, **성공 코드는 API 명세서 단어를 그대로** 쓴다.
  명세서가 오류도 단어형(`ALREADY_IN_QUEUE`)으로 적어놨지만 규약을 따랐고, **메시지는 명세서 문구를 그대로** 넣었다.
- `ApiResponse`는 `code` / `message` / `data` 3개 필드뿐이다. `@JsonInclude(NON_NULL)`.
  검증 오류는 `data.fieldErrors`에 중첩된다(`ValidationErrorResponse`).
- `SuccessCode` 인터페이스가 `global/common/response`에 있다. `ErrorCode`와 대칭 구조다.

| 도메인 | 오류 코드 |
|---|---|
| gameResult | `GAMERESULT-001`~`008` |
| matchmaking | `MATCHMAKING-001`~`005` |

### 4.2 Redis

- 키 규약 `edc:<profile>:<domain>:<resource>:<identifier>`, 소문자 + `:`.
  **`global/common/redis/RedisKeyBuilder`가 강제한다. waitingroom 담당자도 이걸 써야 한다.**
- **`StringRedisTemplate`만 쓴다.** Boot가 기본 등록하는 `RedisTemplate`은 값을 Java 직렬화로
  저장하는데 팀 규약이 이를 금지한다. `global/config/RedisConfig`에서 명시 등록했다.
- matchmaking entry는 **JSON 문자열이 아니라 Redis Hash**로 저장한다.
  Jackson 3 불확실성을 피하고, ERD `matchmaking_entries` 필드와 1:1로 대응시키기 위해서다.

### 4.3 matchmaking 핵심 설계

Lua 스크립트도 분산 락도 쓰지 않는다. **명령 순서만으로 경쟁 조건이 해소된다.**

| 목적 | 명령 |
|---|---|
| 큐 등록 (최초 `queued_at` 보존) | `ZADD NX` — **반드시 먼저** |
| 중복 신청 판정 | `HSETNX` — 나중에. 실패해도 앞 명령이 안 바꿨으므로 롤백 불필요 |
| 후보 선점 | `ZPOPMIN key 2` — 단일 원자 명령. score도 함께 반환 |
| 선점 해제 | 반환받은 score로 `ZADD` — 대기 순서가 밀리지 않음 |

순서를 뒤집으면 안 된다. `HSETNX`가 먼저면 "entry는 있는데 큐에 없는" **복구 불가능한** 상태가 생긴다.
반대 순서의 불완전 상태(큐에는 있고 entry 없음 = 유령)는 `popCandidates`가 청소한다.

`popCandidates`가 걸러내는 것 두 가지다.

1. **entry가 없는 member** — TTL은 entry 키에만 걸리고 Sorted Set member는 만료되지 않는다.
2. **`SEARCHING`이 아닌 member** — 성사된 참가자가 재신청하면 `ZADD NX`가 큐에 다시 넣는다
   (큐에서는 이미 빠졌으므로). 이걸 걸러내지 않으면 **두 번째 방에 배정되는 버그**가 있었다.
   `fix(backend): exclude matched participants from match candidates`로 수정했다.

둘 다 꺼낸 뒤 되돌리지 않고 버려서 큐가 자동 정리된다.

**`Instant`를 밀리초로 잘라 보관한다.** Sorted Set score가 `queuedAt`의 epoch milli이므로,
자르지 않으면 저장 후 읽은 값이 원본과 달라진다. `MatchmakingEntry` record의 canonical 생성자에서 처리한다.

**대기방 생성 실패는 예외든 빈 `Optional`이든 동일하게 처리한다.** 큐를 조작한 것이 matchmaking이므로
되돌릴 책임도 matchmaking에 있다. `MatchmakingService.createRoom()`이 `RuntimeException`을 잡아
ERROR 로그를 남기고 빈 값으로 통일한다.

### 4.4 waitingroom 연동

`waitingroom/service/RandomRoomCreator.java` **인터페이스 1개만** 만들어뒀다.

```java
Optional<UUID> createRandomRoom(GameName gameType, List<String> participantKeys);
```

- 엔티티, Redis 키, `room_code` 생성, 상태 관리는 **아무것도 만들지 않았다.** 설계는 담당자 몫이다.
- `MatchmakingService`가 이를 **`ObjectProvider`로 받는다.** 구현체가 없으면 성사 단계를 건너뛰고
  참가자는 계속 대기한다. 방이 없는 상태에서 성사시켜도 갈 곳이 없으므로 이게 정직한 동작이다.
- 가짜 구현체를 두지 않았기 때문에 **담당자가 `@Service`를 붙인 구현체를 추가하면 그대로 동작한다.**
  빈 충돌도, 삭제할 파일도 없다.
- `MatchmakingWithoutRoomCreatorTest`가 구현체 부재 상태를 검증한다.

**`ObjectProvider`는 여기에만 쓴다.** "빈이 없는 것이 현재의 정상 상태"인 유일한 의존성이기 때문이다.
`MatchmakingEntryRepository` 같은 필수 의존성에 쓰면 진짜 설정 실수를 조용히 삼킨다.

### 4.5 그 밖에

- `matchmaking` 요청 DTO의 `gameType`은 **enum이 아니라 String**이다. enum이면 알 수 없는 값이
  Jackson 역직렬화 단계에서 걸려 공통 오류가 나가는데, 명세서는 `INVALID_GAME_TYPE`을 요구한다.
  서비스 계층에서 변환하며, **나중에 `games` 테이블 존재 검증도 같은 자리에 넣는다**(현재 미구현, 의도적 보류).
- Spring Framework 6.1+는 컨트롤러 메서드 검증이 내장이다. **`@Validated`를 붙이지 않는다** (이중 검증 위험).
- Spring Security 도입 시 `http.cors(withDefaults())`면 MVC CORS 설정을 재사용한다.
  별도 `CorsConfigurationSource` 빈은 **필요 없다** (공식 문서 확인함).
- `docker compose`는 **루트 `compose.dev.yml`만** 쓴다. `backend/compose.yml`은 중복이며
  호스트 포트가 겹쳐 동시 실행이 불가능하고, 프로젝트 이름이 달라 **볼륨이 갈린다**(DB가 두 벌).
- gameResult 시드는 `backend/src/main/resources/data.sql`에 16행. PostgreSQL은 UNIQUE에서 NULL을
  서로 다르게 취급하므로 `IS NOT DISTINCT FROM`으로 멱등성을 확보했다.

---

## 5. 남은 작업

### 5.1 `compose.prod.yml`에 `APP_CORS_ALLOWED_ORIGINS` 추가 — 우선

`application-prod.yml`이 이 값을 기본값 없이 요구하는데 `compose.prod.yml`에 없다.
**지금 상태로 prod를 띄우면 백엔드가 기동 실패한다.** CORS 커밋 때 누락된 것이다.

한 줄 수정이고 테스트는 필요 없다. `chore/backend-prod-cors` 정도로 별도 커밋을 권한다.
같은 브랜치에서 `backend/compose.yml`·`backend/compose.prod.yml` 삭제도 함께 검토할 수 있으나,
`backend/README.md`(30군데 이상)와 `docs/backend-api-development-guide.md:289`,
`docs/backend-common-settings.md:316`이 그 파일을 안내하므로 **`docs/` 수정은 팀 합의가 필요하다.**

### 5.2 `/ws/match` WebSocket

명세와 프레임은 확보했다.

```json
{ "type": "MATCH_SUCCESS", "roomId": "019abcde-5678", "gameType": "EYEFIGHT" }
```

- **raw `WebSocketHandler`가 맞다.** 구독 개념 없이 특정 두 명에게 한 번 보내면 끝이고,
  STOMP를 쓰면 프레임에 STOMP 헤더가 붙어 명세와 달라진다.
  (반면 waitingroom의 "대기방 상태 수신"은 전원 브로드캐스트라 STOMP가 적합할 수 있다. 담당자와 조율.)
- 필요한 것: `spring-boot-starter-websocket` 추가, `participantKey → WebSocketSession` 레지스트리,
  핸들러, `WebSocketConfigurer` 등록.
- **CORS를 다시 설정해야 한다.** 기존 `CorsConfig`는 MVC 설정이라 WebSocket 핸드셰이크에 적용되지 않는다.
  핸들러 등록 시 `setAllowedOrigins(...)`를 따로 준다. `app.cors.allowed-origins` 값을 재사용하면 된다.
- **브라우저는 WebSocket에 커스텀 헤더를 못 붙인다.** 현재 REST가 쓰는 `X-Participant-Key`도, 향후 JWT
  `Authorization`도 불가능하다. 권장안은 **연결을 익명으로 맺고 첫 프레임으로 인증 정보를 보내는 것**이다
  (쿼리 파라미터는 URL·프록시 로그에 토큰이 남는다). **auth 담당자와 합의가 필요하다.**
- **연결 순서 주의.** 클라이언트는 `/api/v1/match/join` 호출 **전에** WS를 연결해야 한다.
  안 그러면 푸시가 유실된다. 그래서 신청 응답에 실제 상태를 담아뒀다(fallback).
- `afterConnectionClosed`가 기능 정의서의 "연결 종료 시 자동 정리"를 구현하는 자리다.
  이때의 취소는 **조용해야** 한다 — 이미 `ENTERING_ROOM`이면 취소하지 않고, 신청이 없어도 예외를 던지지 않는다.
  REST의 `cancel`과 분리된 메서드가 필요하다.
- 다중 인스턴스에서는 in-memory 레지스트리가 깨진다(두 참가자가 다른 인스턴스에 붙을 수 있음).
  해법은 **Redis Pub/Sub**이고 Redis는 이미 있다. 다만 Jenkins는 단일 인스턴스 배포이므로
  당장 필요하지 않다. 레지스트리를 인터페이스로 빼두면 나중에 구현체만 갈아끼울 수 있다.
- 테스트는 두 층으로 나눈다. 레지스트리·알림 로직은 `WebSocketSession` 스텁으로 단위 테스트,
  연결 자체는 `@SpringBootTest(webEnvironment = RANDOM_PORT)` + `StandardWebSocketClient`로 한 번 확인.

### 5.3 user / auth 통합 (다른 담당자 완료 후)

- `participants_.user_id`에 FK 추가
- `@RequestHeader("X-Participant-Key")`를 JWT 추출로 대체. 현재 **game·gameResult·matchmaking 모두**
  이 임시 헤더를 쓴다.
- `MATCHMAKING-005`(참가자 키 형식 오류)는 그때 불필요해진다.

---

## 6. 팀에 전달해야 할 미결 사항

### ERD 변경

- `games_results.play_id UUID NOT NULL UNIQUE` 추가 — 결과 중복 제출 방지용 멱등키. 이미 코드에 반영됨.
- `games.play_mode`를 `SOLO / MULTI / AI` → **`SOLO / INVITE / RANDOM / AI`** 로 변경. 이미 코드에 반영됨.
- `matchmaking_entries.match_status`에 **"선점 중"에 해당하는 값이 없다.**
  `ZPOPMIN`으로 꺼낸 뒤 방 생성을 기다리는 동안 상태가 `SEARCHING`으로 남아 있어,
  그 창에서 취소가 성공하면 직후 `ENTERING_ROOM`이 덮어쓸 수 있다. 창이 짧아 발생 확률은 낮지만
  실제 WaitingRoom 호출이 느려지면 커진다. 값 추가를 검토해야 한다.

### API 명세서 수정

- **랜덤 매칭 취소의 method가 명세서 안에서 충돌한다.** 페이지 속성은 `DELETE`,
  내부 표와 요청 예시는 `POST`. DB 뷰와 속성을 따라 **DELETE로 구현**했다.
- `CANCELLED`가 ERD `match_status`에 없다. 취소는 entry를 삭제하므로 **응답 전용 값**으로 처리했다.
- 취소 API에 실패 케이스가 없다. 기능 정의서의 "SEARCHING에서만 취소 가능"을 지키려고
  `MATCHMAKING-003`(404), `MATCHMAKING-004`(409)를 추가했다.
- 신청 응답 필드를 넓혔다. 명세 예시는 `matchStatus` 하나뿐인데 `participantKey`, `gameType`,
  `waitingRoomId`, `queuedAt`을 추가했다.
- gameResult 관련 수정사항은 워크스페이스의 `명세서페이지_1~3_*.md`, `API명세서_수정사항(gameResult_game).md`에 정리돼 있다.

### 기능 정의서 미정의

- **`IN_WAITING_ROOM` 전이 주체.** "대기방 실시간 연결"의 "RANDOM 방은 매칭 성사 후 10초 이내에
  연결되어야 하며, 연결 성공을 입장 확인으로 사용한다"에 해당한다. 즉 **WaitingRoom의 WS 연결 성공이
  트리거**이므로 matchmaking이 그 진입점을 공개해야 한다. 아직 만들지 않았다.
- **10초 미연결 시 처리**가 없다. `ENTERING_ROOM` 참가자를 큐로 되돌릴지, 정리할지 미정.
  WebSocket 없이는 감지 자체가 불가능하다.
- **`game_type`과 `game_id` 불일치.** matchmaking·waitingroom은 `game_type`(게임 이름)만 다루지만
  gameResult 제출에는 `game_id`(= gameName + playMode + difficulty)가 필요하다. 랜덤 매칭은 난이도를
  선택하지 않으므로 `(HOCKEY, RANDOM, NULL)` 행으로 매핑되는 것이 자연스럽고 시드도 그렇게 돼 있다.
  **경기 종료 후 `game_id`를 결정하는 책임이 누구인지 명세에 없다.**

### 다른 담당자 대상

- **프론트**: 게임 카드가 16개 내려간다. `gameName`으로 그룹핑해서 표시해야 한다.
- **랭킹 담당자**: 점수는 `games_results.game_result` JSONB를 파싱해서 얻는다. 게임별 필드 이름이 다르다.
- **waitingroom 담당자**: `roomType`이 `games.play_mode` 분할로 중복이 됐다. 제거 검토.
- **모든 백엔드**: 이제 Redis 컨테이너가 필요하다. 안 띄우면 `BackendApplicationTests`부터 실패한다.

---

## 7. 참고 산출물 (워크스페이스 루트)

`eye-dont-care` 밖의 파일들은 전부 참고용이며 개발 대상이 아니다.

| 파일 | 내용 |
|---|---|
| `matchmaking_Redis_키설계안.md` | 키 구조, 원자성 근거, TTL 정책. 단 entry는 최종적으로 Hash로 바뀜 |
| `gameResult_JSONB_스키마_제안.md` | `game_result` JSONB 구조 |
| `API명세서_수정사항(gameResult_game).md` | 명세서 수정 지점 |
| `API예시_복붙용(game_gameResult).md` | 요청/응답 예시 |
| `명세서페이지_1~3_*.md` | 노션에 붙여넣을 페이지 단위 문서 |
| `백엔드_환경설정_가이드(IntelliJ 한국어).md` | 환경 설정 |
| `verify-backend-env.ps1` | 환경 검증 스크립트 (`-RunTests`, `-SkipDocker`, `-PingPort`) |
