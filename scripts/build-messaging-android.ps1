# Build Tradesman Messaging Android APK (debug) and AAB (release).
# Run from repo root: npm run mobile:build:android:messaging
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Msg = Join-Path $Root "messaging-app"
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
    Write-Host "JAVA_HOME not set and no JDK found. Install JDK 17+ or Android Studio." -ForegroundColor Red
    exit 1
}
$env:JAVA_HOME = $jh
Write-Host "Using JAVA_HOME=$jh" -ForegroundColor Cyan

$androidSdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"
$localProps = Join-Path $Msg "android\local.properties"
if (-not (Test-Path $localProps) -and (Test-Path $androidSdk)) {
    $sdkDir = ($androidSdk -replace "\\", "/")
    "sdk.dir=$sdkDir" | Set-Content -Path $localProps -Encoding UTF8
    Write-Host "Wrote messaging-app\android\local.properties → $sdkDir" -ForegroundColor Cyan
}
$env:ANDROID_HOME = $androidSdk

Write-Host "`n=== messaging-app cap:sync ===" -ForegroundColor Cyan
Set-Location $Msg
npm run cap:sync
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$gradle = Join-Path $Msg "android\gradlew.bat"
if (-not (Test-Path $gradle)) {
    Write-Host "messaging-app\android\gradlew.bat missing." -ForegroundColor Red
    exit 1
}

Set-Location (Join-Path $Msg "android")
Write-Host "`n=== assembleDebug (installable test APK) ===" -ForegroundColor Cyan
& .\gradlew.bat assembleDebug --no-daemon
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$apk = Join-Path $Msg "android\app\build\outputs\apk\debug\app-debug.apk"
if (Test-Path $apk) {
    Write-Host "`nDebug APK: $apk" -ForegroundColor Green
}

Write-Host "`n=== bundleRelease (Play Store .aab) ===" -ForegroundColor Cyan
& .\gradlew.bat bundleRelease --no-daemon
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$aab = Join-Path $Msg "android\app\build\outputs\bundle\release\app-release.aab"
if (Test-Path $aab) {
    Write-Host "`nRelease bundle: $aab" -ForegroundColor Green
}

Write-Host "`nDone. Upload the AAB to Play Console → Tradesman Messaging (com.tradesmanus.messaging)." -ForegroundColor Green
