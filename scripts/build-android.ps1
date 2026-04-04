# Build Tradesman Android APK (debug) and AAB (release) when keystore is configured.
# Run from repo root: npm run mobile:build:android
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

function Find-JavaHome {
    if ($env:JAVA_HOME -and (Test-Path "$env:JAVA_HOME\bin\java.exe")) { return $env:JAVA_HOME }
    $candidates = @(
        "${env:ProgramFiles}\Android\Android Studio\jbr",
        "${env:LocalAppData}\Programs\Android\Android Studio\jbr",
        "${env:ProgramFiles}\Eclipse Adoptium\jdk-17*",
        "${env:ProgramFiles}\Java\jdk-17*",
        "${env:ProgramFiles}\Microsoft\jdk-17*"
    )
    foreach ($p in $candidates) {
        $resolved = Get-Item $p -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
        if ($resolved -and (Test-Path "$($resolved.FullName)\bin\java.exe")) { return $resolved.FullName }
    }
    return $null
}

$jh = Find-JavaHome
if (-not $jh) {
    Write-Host "JAVA_HOME not set and no JDK found. Install JDK 17+ or Android Studio, then:" -ForegroundColor Red
    Write-Host '  [Environment]::SetEnvironmentVariable("JAVA_HOME", "C:\Program Files\Eclipse Adoptium\jdk-17.x.x-hotspot", "User")' -ForegroundColor Yellow
    exit 1
}
$env:JAVA_HOME = $jh
Write-Host "Using JAVA_HOME=$jh" -ForegroundColor Cyan

$androidSdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"
$localProps = Join-Path $Root "android\local.properties"
if (-not (Test-Path $localProps) -and (Test-Path $androidSdk)) {
    $sdkDir = ($androidSdk -replace "\\", "/")
    "sdk.dir=$sdkDir" | Set-Content -Path $localProps -Encoding UTF8
    Write-Host "Wrote android\local.properties → $sdkDir" -ForegroundColor Cyan
}
$env:ANDROID_HOME = $androidSdk

Write-Host "`n=== npm run mobile:sync ===" -ForegroundColor Cyan
npm run mobile:sync
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$gradle = Join-Path $Root "android\gradlew.bat"
if (-not (Test-Path $gradle)) {
    Write-Host "android\gradlew.bat missing. Run: npx cap add android" -ForegroundColor Red
    exit 1
}

Set-Location (Join-Path $Root "android")
Write-Host "`n=== assembleDebug (installable test APK) ===" -ForegroundColor Cyan
& .\gradlew.bat assembleDebug --no-daemon
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$apk = Join-Path $Root "android\app\build\outputs\apk\debug\app-debug.apk"
if (Test-Path $apk) {
    Write-Host "`nDebug APK: $apk" -ForegroundColor Green
}

$ks = Join-Path $Root "android\keystore.properties"
if (Test-Path $ks) {
    Write-Host "`n=== bundleRelease (Play Store .aab) ===" -ForegroundColor Cyan
    & .\gradlew.bat bundleRelease --no-daemon
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    $aab = Join-Path $Root "android\app\build\outputs\bundle\release\app-release.aab"
    if (Test-Path $aab) {
        Write-Host "`nRelease bundle: $aab" -ForegroundColor Green
    }
} else {
    Write-Host "`nSkip bundleRelease: no android\keystore.properties (copy from keystore.properties.example, add .jks)." -ForegroundColor Yellow
}

Write-Host "`nDone." -ForegroundColor Green
