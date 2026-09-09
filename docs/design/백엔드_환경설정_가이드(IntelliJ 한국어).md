# 백엔드 환경 설정 가이드 (IntelliJ 한국어 UI 기준)

IntelliJ IDEA에 **한국어 언어 팩(Korean Language Pack)** 을 적용한 환경 기준입니다.

> 한국어 언어 팩은 모든 문자열을 번역하지 않습니다. 일부 메뉴는 영어로 그대로 남아 있으므로,
> 아래 가이드는 `한국어(English)` 형태로 병기했습니다. 둘 중 보이는 쪽을 찾으면 됩니다.
>
> 버전에 따라 문구가 조금씩 다를 수 있습니다. 메뉴가 안 보이면 **단축키**나
> **작업 검색(`Shift` 두 번)** 으로 영어 원문을 입력해 찾는 것이 가장 빠릅니다.

터미널 명령어(PowerShell, Git, Docker, Gradle)는 UI 언어와 무관하게 동일합니다.

---

## 1. Git 상태 확인

IntelliJ 하단 **터미널(Terminal)** 탭에서 실행합니다. (단축키: `Alt` + `F12`)

```powershell
git status
git branch --show-current
```

**정상 기준**

```text
On branch dev
nothing to commit, working tree clean
```

`dev`가 아니면 아래로 이동합니다.

```powershell
git switch dev
git pull origin dev
```

> `main`에서는 직접 작업하지 않습니다.

---

## 2. JDK 25 설치

**메뉴 경로**

```text
파일 (File)
→ 프로젝트 구조... (Project Structure...)
→ 플랫폼 설정 (Platform Settings)
→ SDK (SDKs)
→ + 버튼
→ JDK 다운로드... (Download JDK...)
```

**단축키**: `Ctrl` + `Alt` + `Shift` + `S`

**설정값**

| 항목 | 값 |
| --- | --- |
| 버전 (Version) | `25` |
| 공급업체 (Vendor) | `Eclipse Temurin` |
| 위치 (Location) | 기본값 유지 |

**다운로드 (Download)** 를 누르고 완료될 때까지 기다립니다.
SDK 목록에 `temurin-25`가 표시되면 정상입니다.

---

## 3. 프로젝트 SDK와 Gradle JVM 설정

### 3-1. 프로젝트 SDK

```text
파일 (File)
→ 프로젝트 구조... (Project Structure...)
→ 프로젝트 설정 (Project Settings)
→ 프로젝트 (Project)
→ SDK: temurin-25 선택
```

**언어 수준 (Language level)** 도 `25`로 맞춰 줍니다.

설정 후 **적용 (Apply)** → **확인 (OK)** 을 누릅니다.

### 3-2. Gradle JVM

*(이 항목이 안 보이면 4번을 먼저 진행한 뒤 다시 돌아옵니다.)*

```text
파일 (File)
→ 설정... (Settings...)
→ 빌드, 실행, 배포 (Build, Execution, Deployment)
→ 빌드 도구 (Build Tools)
→ Gradle
→ Gradle JVM: 프로젝트 SDK temurin-25 (Project SDK temurin-25)
```

**단축키**: `Ctrl` + `Alt` + `S`

> `Gradle JVM`은 한국어 팩에서도 영어로 표시되는 경우가 많습니다.

---

## 4. Gradle 프로젝트 연결 및 동기화

프로젝트 뷰에서 `backend/build.gradle`을 **우클릭**합니다.

```text
Gradle 프로젝트 연결 (Link Gradle Project)
```

**메뉴가 보이지 않는 경우**

```text
파일 (File)
→ 새로 만들기 (New)
→ 기존 소스에서 모듈 가져오기... (Module from Existing Sources...)
→ backend/build.gradle 선택
→ Gradle 가져오기 (Import module from external model: Gradle)
```

연결 후 오른쪽 **Gradle** 도구 창을 열고 새로고침 아이콘(↻)을 누릅니다.

```text
모든 Gradle 프로젝트 다시 로드 (Reload All Gradle Projects)
```

**터미널에서 확인**

```powershell
cd backend
.\gradlew.bat --version
```

**정상 기준**

```text
Gradle 9.5.1
Launcher JVM: 25
```

`Launcher JVM`이 25가 아니면 3-2로 돌아가 Gradle JVM을 다시 확인합니다.

---

## 5. WSL 2 확인

**관리자 권한 PowerShell**에서 실행합니다.
(시작 메뉴 → `PowerShell` 우클릭 → **관리자 권한으로 실행**)

```powershell
wsl --version
wsl --status
```

**설치되어 있지 않은 경우**

```powershell
wsl --install
```

**Windows 기능을 직접 활성화해야 하는 경우**

```powershell
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
```

위 기능을 새로 켰다면 **Windows를 재부팅**합니다. 재부팅 후:

```powershell
wsl --update
wsl --set-default-version 2
wsl --status
```

**작업 관리자 확인**

```text
작업 관리자
→ 성능
→ CPU
→ 가상화: 사용
```

`사용 안 함`으로 나오면 BIOS/UEFI에서 가상화(Intel VT-x 또는 AMD-V)를 켜야 합니다.

---

## 6. Docker Desktop 설치 및 확인

Docker Desktop을 설치하고 실행합니다. 고래 아이콘이 **초록색**이 될 때까지 기다립니다.

```powershell
docker --version
docker compose version
docker run --rm hello-world
```

**정상 기준**

```text
Hello from Docker!
```

> `error during connect` 오류가 나면 Docker Desktop이 아직 켜지지 않은 것입니다.

---

## 7. `backend/.env` 생성

```powershell
cd backend
Copy-Item .env.example .env
```

**파일 확인**

```powershell
Get-ChildItem -Force .env*
```

**Git에 포함되지 않는지 확인**

```powershell
git status
```

`.env`가 변경 파일 목록에 **표시되지 않아야** 합니다.

---

## 8. PostgreSQL 컨테이너 실행

`backend` 폴더에서 실행합니다.

```powershell
docker compose -f compose.yml up -d postgres
```

**상태 확인**

```powershell
docker compose -f compose.yml ps
```

**DB 연결 준비 상태 확인**

```powershell
docker compose -f compose.yml exec postgres pg_isready -U backend -d backend
```

**정상 기준**

```text
accepting connections
```

### 컨테이너 관리 명령어

| 목적 | 명령어 |
| --- | --- |
| 중지 | `docker compose -f compose.yml stop` |
| 다시 시작 | `docker compose -f compose.yml start` |
| 제거 (데이터 유지) | `docker compose -f compose.yml down` |
| 제거 (데이터 삭제) | `docker compose -f compose.yml down -v` |

> `-v` 옵션은 로컬 DB 데이터까지 삭제합니다. 초기화가 꼭 필요할 때만 사용하세요.

---

## 9. Gradle 테스트

`backend` 폴더에서 실행합니다.

```powershell
.\gradlew.bat test
```

**정상 기준**

```text
BUILD SUCCESSFUL
```

> 현재 테스트는 PostgreSQL 연결이 필요합니다. 8번을 먼저 실행해야 합니다.

---

## 10. Spring Boot 실행

```powershell
.\gradlew.bat bootRun
```

**정상 기준**

```text
Tomcat started on port 8080
Started BackendApplication
```

`bootRun`은 서버를 계속 실행하는 명령이므로 `EXECUTING` 상태가 유지되는 것이 정상입니다.

**서버 종료**: `Ctrl` + `C`

---

## 11. Postman으로 Ping API 확인

Spring Boot 서버가 실행 중인 상태에서 요청합니다.

```text
GET http://localhost:8080/api/ping
```

포트를 `8000`로 변경한 경우:

```text
GET http://localhost:8000/api/ping
```

**정상 기준**

- HTTP 상태 코드 `200 OK`
- `success: true`
- Ping 응답 데이터 확인

```json
{
  "success": true,
  "code": "SUCCESS",
  "message": "요청에 성공했습니다.",
  "data": {
    "status": "pong"
  }
}
```

**PowerShell에서 확인**

```powershell
curl.exe http://localhost:8080/api/ping
```

---

## 부록 A. 자주 쓰는 IntelliJ 단축키

메뉴를 찾기 어려울 때 단축키가 더 빠릅니다.

| 기능 | 단축키 |
| --- | --- |
| 설정 (Settings) | `Ctrl` + `Alt` + `S` |
| 프로젝트 구조 (Project Structure) | `Ctrl` + `Alt` + `Shift` + `S` |
| 터미널 (Terminal) | `Alt` + `F12` |
| 작업 검색 (Search Everywhere) | `Shift` 두 번 |
| 액션 검색 (Find Action) | `Ctrl` + `Shift` + `A` |

> **액션 검색**에 영어 원문(예: `Reload All Gradle Projects`)을 입력하면
> 한국어 UI에서도 대부분 그대로 찾을 수 있습니다.

---

## 부록 B. IntelliJ UI를 영어로 되돌리기

한국어 번역 때문에 영어 문서와 대조가 어렵다면 언어 팩을 끌 수 있습니다.

```text
파일 (File)
→ 설정... (Settings...)
→ 플러그인 (Plugins)
→ 설치됨 (Installed)
→ Korean Language Pack / 한국어 언어 팩
→ 사용 안 함 (Disable)
→ IDE 재시작 (Restart IDE)
```

---

## 부록 C. 자동 검증 스크립트

1~11단계 중 자동으로 확인 가능한 항목을 한 번에 점검합니다.

```powershell
cd <프로젝트 루트>
powershell -ExecutionPolicy Bypass -File .\verify-backend-env.ps1
```

| 옵션 | 설명 |
| --- | --- |
| `-RunTests` | `gradlew test`까지 실행 (느림) |
| `-SkipDocker` | Docker·PostgreSQL 점검 건너뜀 |
| `-PingPort 8000` | Ping 확인 포트 변경 |

결과는 `PASS` / `WARNING` / `BLOCKER`로 표시됩니다.
