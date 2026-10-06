param(
    [string]$BaseUrl = $(if ($env:SMARTATTEND_BASE_URL) { $env:SMARTATTEND_BASE_URL } else { 'http://localhost:3000' }),
    [switch]$StartApp,
    [switch]$Mutating
)

$ErrorActionPreference = 'Stop'
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptRoot '..\..')).Path
$cacheRoot = Join-Path $scriptRoot '.cache'
$classesRoot = Join-Path $scriptRoot 'build\classes'
$junitVersion = '1.11.4'
$junitJar = Join-Path $cacheRoot "junit-platform-console-standalone-$junitVersion.jar"
$junitUri = "https://repo1.maven.org/maven2/org/junit/platform/junit-platform-console-standalone/$junitVersion/junit-platform-console-standalone-$junitVersion.jar"
$appProcess = $null

New-Item -ItemType Directory -Force -Path $cacheRoot, $classesRoot | Out-Null

if (-not (Test-Path -LiteralPath $junitJar)) {
    Write-Host "Downloading JUnit Platform Console $junitVersion..."
    Invoke-WebRequest -Uri $junitUri -OutFile $junitJar
}

function Wait-SmartAttend([string]$Url) {
    $deadline = [DateTime]::UtcNow.AddSeconds(60)
    do {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
            if ($response.StatusCode -eq 200) { return }
        } catch {
            Start-Sleep -Milliseconds 500
        }
    } while ([DateTime]::UtcNow -lt $deadline)

    throw "SmartAttend did not become ready at $Url within 60 seconds."
}

function Test-SmartAttend([string]$Url) {
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

try {
    if ($StartApp) {
        if (Test-SmartAttend $BaseUrl) {
            Write-Host "Using the SmartAttend server already running at $BaseUrl."
        } else {
            $stdoutLog = Join-Path $cacheRoot 'next-junit.stdout.log'
            $stderrLog = Join-Path $cacheRoot 'next-junit.stderr.log'
            $appProcess = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/d', '/s', '/c', 'pnpm.cmd dev') -WorkingDirectory $repoRoot -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog
            Wait-SmartAttend $BaseUrl
        }
    }

    $javaSources = Get-ChildItem -LiteralPath (Join-Path $scriptRoot 'src\test\java') -Recurse -Filter '*.java'
    if (-not $javaSources) { throw 'No JUnit Java sources were found.' }

    & javac --release 21 -encoding UTF-8 -cp $junitJar -d $classesRoot $javaSources.FullName
    if ($LASTEXITCODE -ne 0) { throw "javac failed with exit code $LASTEXITCODE" }

    $env:SMARTATTEND_BASE_URL = $BaseUrl.TrimEnd('/')
    if ($Mutating) { $env:SMARTATTEND_RUN_MUTATING = 'true' }

    & java -jar $junitJar execute --class-path $classesRoot --scan-class-path --details tree --fail-if-no-tests
    exit $LASTEXITCODE
} finally {
    if ($appProcess -and -not $appProcess.HasExited) {
        & taskkill.exe /PID $appProcess.Id /T /F | Out-Null
    }
}
