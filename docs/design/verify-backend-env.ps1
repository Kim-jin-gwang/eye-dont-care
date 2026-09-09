<#
.SYNOPSIS
    Verifies the local backend development environment for eye-dont-care.

.DESCRIPTION
    Checks Git state, JDK 25, Gradle, WSL 2, Docker Desktop, the backend/.env
    file, and the PostgreSQL dev container. Optionally runs the Gradle test
    suite and probes the Ping API.

    Read-only by default except for two safe actions:
      - creates backend/.env from .env.example if missing
      - starts the postgres container (unless -SkipDocker)

.PARAMETER RunTests
    Also runs .\gradlew.bat test. Slow (several minutes on first run).

.PARAMETER SkipDocker
    Skips every Docker and PostgreSQL check.

.PARAMETER PingPort
    Port used for the Ping API probe. Default 8080.

.EXAMPLE
    .\verify-backend-env.ps1
    .\verify-backend-env.ps1 -RunTests
    .\verify-backend-env.ps1 -SkipDocker -PingPort 8000

.NOTES
    Run from anywhere. Docker Desktop must be running for the Docker checks.
    If execution is blocked, run:
      powershell -ExecutionPolicy Bypass -File .\verify-backend-env.ps1
#>

[CmdletBinding()]
param(
    [switch]$RunTests,
    [switch]$SkipDocker,
    [int]$PingPort = 8080
)

$ErrorActionPreference = 'Continue'

# ---------------------------------------------------------------- paths ----

$RepoRoot   = Join-Path $PSScriptRoot 'eye-dont-care'
$BackendDir = Join-Path $RepoRoot 'backend'

# -------------------------------------------------------------- results ----

$Results = New-Object System.Collections.Generic.List[object]

function Add-Result {
    param(
        [Parameter(Mandatory)][string]$Step,
        [Parameter(Mandatory)][ValidateSet('PASS', 'WARNING', 'BLOCKER', 'INFO', 'SKIP')][string]$Status,
        [string]$Detail = ''
    )

    $Results.Add([pscustomobject]@{
        Step   = $Step
        Status = $Status
        Detail = $Detail
    })

    $color = switch ($Status) {
        'PASS'    { 'Green' }
        'WARNING' { 'Yellow' }
        'BLOCKER' { 'Red' }
        'SKIP'    { 'DarkGray' }
        default   { 'Cyan' }
    }

    Write-Host ('  [{0,-7}] {1}' -f $Status, $Step) -ForegroundColor $color
    if ($Detail) {
        Write-Host ('            {0}' -f $Detail) -ForegroundColor DarkGray
    }
}

function Write-Section {
    param([Parameter(Mandatory)][string]$Title)
    Write-Host ''
    Write-Host "== $Title" -ForegroundColor White
}

function Test-Command {
    param([Parameter(Mandatory)][string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Invoke-Capture {
    param(
        [Parameter(Mandatory)][string]$File,
        [string[]]$Arguments = @(),
        [string]$WorkingDirectory
    )

    $previous = $null
    if ($WorkingDirectory) {
        $previous = Get-Location
        Set-Location $WorkingDirectory
    }

    try {
        $output = & $File @Arguments 2>&1 | Out-String
        return [pscustomobject]@{
            ExitCode = $LASTEXITCODE
            Output   = $output.Trim()
        }
    }
    catch {
        return [pscustomobject]@{
            ExitCode = -1
            Output   = $_.Exception.Message
        }
    }
    finally {
        if ($previous) { Set-Location $previous }
    }
}

Write-Host ''
Write-Host 'Backend environment verification - eye-dont-care' -ForegroundColor White
Write-Host ("Repo: {0}" -f $RepoRoot) -ForegroundColor DarkGray

# ------------------------------------------------------- 0. repo layout ----

Write-Section '0. Repository layout'

if (-not (Test-Path $BackendDir)) {
    Add-Result 'backend directory found' 'BLOCKER' "Not found: $BackendDir"
    Write-Host ''
    Write-Host 'Cannot continue. Place this script next to the eye-dont-care folder.' -ForegroundColor Red
    exit 1
}
Add-Result 'backend directory found' 'PASS' $BackendDir

# --------------------------------------------------------------- 1. git ----

Write-Section '1. Git state'

if (-not (Test-Command 'git')) {
    Add-Result 'git available' 'BLOCKER' 'git is not on PATH.'
}
else {
    $branch = (Invoke-Capture 'git' @('branch', '--show-current') $RepoRoot).Output

    if ($branch -eq 'dev') {
        Add-Result 'current branch is dev' 'PASS' "branch = $branch"
    }
    elseif ($branch -match '^(feat|bugfix|refactor|docs)/') {
        Add-Result 'current branch is dev' 'INFO' "branch = $branch (working branch, fine)"
    }
    elseif ($branch -eq 'main') {
        Add-Result 'current branch is dev' 'BLOCKER' 'On main. Never work directly on main.'
    }
    else {
        Add-Result 'current branch is dev' 'WARNING' "branch = $branch"
    }

    $status = (Invoke-Capture 'git' @('status', '--porcelain') $RepoRoot).Output

    if ([string]::IsNullOrWhiteSpace($status)) {
        Add-Result 'working tree clean' 'PASS' 'nothing to commit'
    }
    else {
        $count = ($status -split "`n").Count
        Add-Result 'working tree clean' 'WARNING' "$count changed path(s)"
    }
}

# --------------------------------------------------------------- 2. jdk ----

Write-Section '2. JDK 25'

$javaHome = $env:JAVA_HOME
if ($javaHome) {
    Add-Result 'JAVA_HOME set' 'INFO' $javaHome
}
else {
    Add-Result 'JAVA_HOME set' 'INFO' 'not set (Gradle toolchain may still resolve a JDK)'
}

if (Test-Command 'java') {
    $javaVersion = (Invoke-Capture 'java' @('-version')).Output
    $firstLine = ($javaVersion -split "`n")[0].Trim()

    if ($javaVersion -match 'version "?25') {
        Add-Result 'java on PATH is 25' 'PASS' $firstLine
    }
    else {
        Add-Result 'java on PATH is 25' 'WARNING' "$firstLine - Gradle toolchain may still find JDK 25"
    }
}
else {
    Add-Result 'java on PATH is 25' 'WARNING' 'java not on PATH. Only a problem if Gradle cannot find a toolchain.'
}

# ------------------------------------------------------------ 3. gradle ----

Write-Section '3. Gradle wrapper'

$gradlew = Join-Path $BackendDir 'gradlew.bat'

if (-not (Test-Path $gradlew)) {
    Add-Result 'gradlew.bat present' 'BLOCKER' "Not found: $gradlew"
}
else {
    Add-Result 'gradlew.bat present' 'PASS' ''

    Write-Host '            running gradlew --version (may download Gradle) ...' -ForegroundColor DarkGray
    $gradleVersion = Invoke-Capture $gradlew @('--version') $BackendDir

    if ($gradleVersion.ExitCode -ne 0) {
        $gradleTail = (($gradleVersion.Output -split "`n") | Select-Object -Last 5) -join ' | '
        Add-Result 'gradle wrapper runs' 'BLOCKER' $gradleTail
    }
    else {
        Add-Result 'gradle wrapper runs' 'PASS' ''

        if ($gradleVersion.Output -match 'Gradle\s+(\S+)') {
            $found = $Matches[1]
            if ($found -eq '9.5.1') {
                Add-Result 'Gradle version 9.5.1' 'PASS' "Gradle $found"
            }
            else {
                Add-Result 'Gradle version 9.5.1' 'WARNING' "Gradle $found (expected 9.5.1)"
            }
        }

        if ($gradleVersion.Output -match 'Launcher JVM:\s+(\S+)') {
            $launcher = $Matches[1]
            if ($launcher -like '25*') {
                Add-Result 'Launcher JVM is 25' 'PASS' "Launcher JVM: $launcher"
            }
            else {
                Add-Result 'Launcher JVM is 25' 'WARNING' "Launcher JVM: $launcher (set Gradle JVM to temurin-25 in IntelliJ)"
            }
        }
    }
}

# --------------------------------------------------------------- 4. wsl ----

Write-Section '4. WSL 2'

if (-not (Test-Command 'wsl')) {
    if ($SkipDocker) {
        Add-Result 'WSL installed' 'SKIP' '-SkipDocker'
    }
    else {
        Add-Result 'WSL installed' 'BLOCKER' 'Run in an admin PowerShell: wsl --install (then reboot)'
    }
}
else {
    $wslStatus = (Invoke-Capture 'wsl' @('--status')).Output -replace "`0", ''

    if ($wslStatus -match '2') {
        Add-Result 'WSL available' 'PASS' (($wslStatus -split "`n")[0].Trim())
    }
    else {
        Add-Result 'WSL available' 'WARNING' 'Could not confirm default version 2. Run: wsl --set-default-version 2'
    }
}

# ------------------------------------------------------------ 5. docker ----

Write-Section '5. Docker Desktop'

$dockerReady = $false

if ($SkipDocker) {
    Add-Result 'docker checks' 'SKIP' '-SkipDocker'
}
elseif (-not (Test-Command 'docker')) {
    Add-Result 'docker on PATH' 'BLOCKER' 'Install Docker Desktop and restart the terminal.'
}
else {
    $dockerVersion = Invoke-Capture 'docker' @('--version')
    Add-Result 'docker on PATH' 'PASS' $dockerVersion.Output

    $dockerInfo = Invoke-Capture 'docker' @('info', '--format', '{{.ServerVersion}}')

    if ($dockerInfo.ExitCode -ne 0) {
        Add-Result 'docker daemon running' 'BLOCKER' 'Start Docker Desktop, then re-run this script.'
    }
    else {
        Add-Result 'docker daemon running' 'PASS' "server $($dockerInfo.Output)"
        $dockerReady = $true

        $composeVersion = Invoke-Capture 'docker' @('compose', 'version')
        if ($composeVersion.ExitCode -eq 0) {
            Add-Result 'docker compose available' 'PASS' $composeVersion.Output
        }
        else {
            Add-Result 'docker compose available' 'BLOCKER' 'docker compose plugin missing.'
        }

        $hello = Invoke-Capture 'docker' @('run', '--rm', 'hello-world')
        if ($hello.Output -match 'Hello from Docker') {
            Add-Result 'docker run hello-world' 'PASS' 'Hello from Docker!'
        }
        else {
            Add-Result 'docker run hello-world' 'WARNING' 'Unexpected output. Check network or image pull limits.'
        }
    }
}

# --------------------------------------------------------------- 6. env ----

Write-Section '6. backend/.env'

$envFile    = Join-Path $BackendDir '.env'
$envExample = Join-Path $BackendDir '.env.example'

if (Test-Path $envFile) {
    Add-Result '.env exists' 'PASS' $envFile
}
elseif (Test-Path $envExample) {
    Copy-Item $envExample $envFile
    Add-Result '.env exists' 'PASS' 'created from .env.example'
}
else {
    Add-Result '.env exists' 'BLOCKER' 'Neither .env nor .env.example found.'
}

if ((Test-Path $envFile) -and (Test-Command 'git')) {
    $ignored = Invoke-Capture 'git' @('check-ignore', 'backend/.env') $RepoRoot

    if ($ignored.ExitCode -eq 0) {
        Add-Result '.env is gitignored' 'PASS' 'not tracked by git'
    }
    else {
        Add-Result '.env is gitignored' 'BLOCKER' '.env would be committed. Fix .gitignore before committing.'
    }
}

# ---------------------------------------------------------- 7. postgres ----

Write-Section '7. PostgreSQL container'

if (-not $dockerReady) {
    Add-Result 'postgres container' 'SKIP' 'Docker not ready'
}
else {
    Write-Host '            starting postgres ...' -ForegroundColor DarkGray
    $up = Invoke-Capture 'docker' @('compose', '-f', 'compose.yml', 'up', '-d', 'postgres') $BackendDir

    if ($up.ExitCode -ne 0) {
        $upTail = (($up.Output -split "`n") | Select-Object -Last 3) -join ' | '
        Add-Result 'postgres container up' 'BLOCKER' $upTail
    }
    else {
        Add-Result 'postgres container up' 'PASS' ''

        $ready = $false
        foreach ($attempt in 1..15) {
            $probe = Invoke-Capture 'docker' @('compose', '-f', 'compose.yml', 'exec', '-T', 'postgres', 'pg_isready', '-U', 'backend', '-d', 'backend') $BackendDir
            if ($probe.Output -match 'accepting connections') {
                $ready = $true
                break
            }
            Start-Sleep -Seconds 2
        }

        if ($ready) {
            Add-Result 'postgres accepting connections' 'PASS' 'pg_isready OK'
        }
        else {
            Add-Result 'postgres accepting connections' 'BLOCKER' 'Timed out after 30s. Check: docker compose -f compose.yml logs postgres'
        }
    }
}

# ------------------------------------------------------------- 8. tests ----

Write-Section '8. Gradle test'

if (-not $RunTests) {
    Add-Result 'gradlew test' 'SKIP' 'Pass -RunTests to run the suite (slow).'
}
elseif (-not (Test-Path $gradlew)) {
    Add-Result 'gradlew test' 'SKIP' 'gradlew.bat missing'
}
else {
    Write-Host '            running gradlew test (this takes a while) ...' -ForegroundColor DarkGray
    $test = Invoke-Capture $gradlew @('test', '--console=plain') $BackendDir

    if ($test.ExitCode -eq 0) {
        Add-Result 'gradlew test' 'PASS' 'BUILD SUCCESSFUL'
    }
    else {
        $tail = (($test.Output -split "`n") | Where-Object { $_ -match '(FAILED|error:|Caused by)' } | Select-Object -First 3) -join ' | '
        Add-Result 'gradlew test' 'BLOCKER' $tail
    }
}

# -------------------------------------------------------------- 9. ping ----

Write-Section '9. Ping API'

$pingUrl = "http://localhost:$PingPort/api/ping"

try {
    $response = Invoke-WebRequest -Uri $pingUrl -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop

    if ($response.StatusCode -eq 200 -and $response.Content -match '"success"\s*:\s*true') {
        Add-Result 'GET /api/ping' 'PASS' $response.Content
    }
    else {
        Add-Result 'GET /api/ping' 'WARNING' "HTTP $($response.StatusCode): $($response.Content)"
    }
}
catch {
    Add-Result 'GET /api/ping' 'INFO' "No server on port $PingPort. Start it with: cd backend; .\gradlew.bat bootRun"
}

# ------------------------------------------------------------- summary ----

Write-Host ''
Write-Host '== Summary' -ForegroundColor White
Write-Host ''

$Results | Format-Table -AutoSize Status, Step, Detail

$blockers = @($Results | Where-Object { $_.Status -eq 'BLOCKER' })
$warnings = @($Results | Where-Object { $_.Status -eq 'WARNING' })

Write-Host ("PASS {0}  WARNING {1}  BLOCKER {2}" -f
    @($Results | Where-Object { $_.Status -eq 'PASS' }).Count,
    $warnings.Count,
    $blockers.Count)

Write-Host ''

if ($blockers.Count -gt 0) {
    Write-Host 'Blockers to fix:' -ForegroundColor Red
    foreach ($b in $blockers) {
        Write-Host ("  - {0}: {1}" -f $b.Step, $b.Detail) -ForegroundColor Red
    }
    exit 1
}

if ($warnings.Count -gt 0) {
    Write-Host 'Environment usable, but review the warnings above.' -ForegroundColor Yellow
    exit 0
}

Write-Host 'Environment looks good.' -ForegroundColor Green
exit 0
