param(
    [string]$Task = "assembleDebug"
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$androidDir = Join-Path $projectRoot "android"
$candidates = @()

if ($env:HERTUR_JAVA_HOME) {
    $candidates += $env:HERTUR_JAVA_HOME
}

$portableRoot = "D:\HERTUR_TOOLS\jdk21"
if (Test-Path $portableRoot) {
    $portableJdks = Get-ChildItem -Path $portableRoot -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like "jdk-21*" } |
        Sort-Object Name -Descending
    $candidates += $portableJdks.FullName
}

$adoptiumRoot = "C:\Program Files\Eclipse Adoptium"
if (Test-Path $adoptiumRoot) {
    $installedJdks = Get-ChildItem -Path $adoptiumRoot -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like "jdk-21*" } |
        Sort-Object Name -Descending
    $candidates += $installedJdks.FullName
}

$javaHome = $null
foreach ($candidate in ($candidates | Select-Object -Unique)) {
    $javaExe = Join-Path $candidate "bin\java.exe"
    $releaseFile = Join-Path $candidate "release"
    if (-not (Test-Path $javaExe) -or -not (Test-Path $releaseFile)) { continue }

    $releaseText = Get-Content -Path $releaseFile -Raw
    if ($releaseText -match 'JAVA_VERSION="21\.') {
        $javaHome = $candidate
        break
    }
}

if (-not $javaHome) {
    throw "HERTUR Android requiere JDK 21. Define HERTUR_JAVA_HOME o coloca JDK 21 en D:\HERTUR_TOOLS\jdk21."
}

$env:JAVA_HOME = $javaHome
$env:Path = "$javaHome\bin;$env:Path"

Write-Host "HERTUR Android -> JDK 21: $javaHome" -ForegroundColor Cyan

Push-Location $androidDir
try {
    & .\gradlew.bat $Task
    if ($LASTEXITCODE -ne 0) {
        throw "Gradle terminó con código $LASTEXITCODE."
    }
}
finally {
    Pop-Location
}
