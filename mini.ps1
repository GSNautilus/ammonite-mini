<#
.SYNOPSIS
  Build, test and serve Ammonite Mini (docs/MINI_PLAN.md).

.DESCRIPTION
  Python: $env:AMMONITE_PYTHON if set (a python.exe with numpy), else the
  codex conda env's python.exe, else "python".

.EXAMPLE
  .\mini.ps1 build
  The engine DLL for the tests, with MSVC + CMake + Ninja from Visual Studio
  Build Tools 2022 (as desktop.ps1) -> build\cmake\bin\ammonite_engine.dll.

.EXAMPLE
  .\mini.ps1 test
  Builds, then runs tests\engine\test_*.py against that DLL: the desktop's
  engine tests, unchanged, the guard against drift from the snapshot.

.EXAMPLE
  .\mini.ps1 pair -Device 192.168.1.20:37123 -Code 123456
  Once per PC: pair with the tablet over Wireless debugging (Developer options
  -> Wireless debugging -> Pair device with pairing code: its address and code).
  .\mini.ps1 connect -Device 192.168.1.20:41234
  Then connect, to the address on the Wireless debugging screen itself (its
  port changes each time Wireless debugging is switched on).

.EXAMPLE
  .\mini.ps1 apk       # android\app\build\outputs\apk\debug\app-debug.apk (Gradle, the SDK, Android Studio's JDK)
  .\mini.ps1 install   # apk, then onto the tablet
  .\mini.ps1 run       # install, then start it: the page from the APK, the default preset playing
  .\mini.ps1 run -Dev  # the same, the page from this PC (.\mini.ps1 serve in another window): page edits
                       # need only a reload; kept until a plain run
  .\mini.ps1 bench     # install, start it benching, print the results from logcat
  .\mini.ps1 log       # logcat, the app's lines (Ctrl+C stops)
  .\mini.ps1 shot      # the tablet's screen -> build\shot.png

.EXAMPLE
  .\mini.ps1 serve
  The page for a browser on this PC or the tablet:
  http://<this PC's IP>:<Port>/dev.html (default port 8010).
#>
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('build', 'test', 'serve', 'pair', 'connect', 'apk', 'install', 'run', 'bench', 'log', 'shot')]
    [string]$Action,
    [int]$Port = 8010,
    [string]$Device = '',
    [string]$Code = '',
    [switch]$Dev
)

$ErrorActionPreference = 'Stop'
$root  = $PSScriptRoot
$build = Join-Path $root 'build'
$dll   = Join-Path $build 'cmake\bin\ammonite_engine.dll'
$codex = Join-Path $env:USERPROFILE 'miniconda3\envs\codex\python.exe'
$py    = if ($env:AMMONITE_PYTHON) { $env:AMMONITE_PYTHON } elseif (Test-Path $codex) { $codex } else { 'python' }

# MSVC + CMake + Ninja from Visual Studio Build Tools 2022. vcvars64 sets up
# the environment inside a batch file (one command per line: cmd expands
# %PATH% when it reads a line, so it cannot be chained after vcvars).
function Invoke-MsvcBuild {
    $vs = 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools'
    $cm = "$vs\Common7\IDE\CommonExtensions\Microsoft\CMake"
    if (-not (Test-Path "$vs\VC\Auxiliary\Build\vcvars64.bat")) {
        throw "Visual Studio Build Tools 2022 not found at $vs"
    }
    $bat = Join-Path $build 'build_mini.bat'
    $out = Join-Path $build 'cmake'
    @(
        '@echo off',
        "call `"$vs\VC\Auxiliary\Build\vcvars64.bat`" >nul || exit /b 1",
        "set `"PATH=$cm\CMake\bin;$cm\Ninja;%PATH%`"",
        # cl explicitly: another g++ on PATH would win
        "cmake -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_CXX_COMPILER=cl -S `"$root`" -B `"$out`" || exit /b 1",
        "cmake --build `"$out`" || exit /b 1"
    ) | Set-Content -Encoding ascii $bat
    & cmd /c $bat | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'build failed' }
}

# Android: the SDK where Android Studio puts it, and Android Studio's own JDK, unless set otherwise
$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$adb = Join-Path $sdk 'platform-tools\adb.exe'
$app = 'com.ammonite.mini'
$apk = Join-Path $root 'android\app\build\outputs\apk\debug\app-debug.apk'

function Invoke-Adb {
    if (-not (Test-Path $adb)) { throw "adb not found at $adb (Android Studio -> SDK Manager -> SDK Tools -> Platform-Tools)" }
    & $adb @args
    if ($LASTEXITCODE -ne 0) { throw "adb $($args -join ' ') failed" }
}
function Assert-Device {
    $lines = & $adb devices | Select-Object -Skip 1 | Where-Object { $_ -match '\sdevice$' }
    if (-not $lines) { throw 'no tablet connected: .\mini.ps1 connect -Device <address:port from Wireless debugging>' }
    # the tablet can be listed twice (adb's own mDNS connection and a manual one): the first of them
    if (-not $env:ANDROID_SERIAL) { $env:ANDROID_SERIAL = (@($lines)[0] -split '\s+')[0] }
}
function Invoke-Gradle {
    if (-not $env:JAVA_HOME) { $env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr' }
    if (-not (Test-Path (Join-Path $env:JAVA_HOME 'bin\java.exe'))) { throw "no JDK at $env:JAVA_HOME (set JAVA_HOME)" }
    if (-not (Test-Path $sdk)) { throw "no Android SDK at $sdk (set ANDROID_HOME)" }
    "sdk.dir=$($sdk -replace '\\', '/')" | Set-Content -Encoding ascii (Join-Path $root 'android\local.properties')
    & cmd /c "cd /d `"$root\android`" && gradlew.bat assembleDebug --console=plain -q"
    if ($LASTEXITCODE -ne 0) { throw 'gradle build failed' }
    Write-Host "built $apk" -ForegroundColor Green
}
function Install-App { Invoke-Gradle; Assert-Device; Invoke-Adb install -r $apk }

New-Item -ItemType Directory -Force $build | Out-Null

switch ($Action) {
    'build' {
        Invoke-MsvcBuild
        Write-Host "built $dll" -ForegroundColor Green
    }
    'test' {
        Invoke-MsvcBuild
        $env:AMMO_ENGINE_DLL = $dll # the tests look for it under desktop's layout otherwise
        $failed = @()
        foreach ($dir in 'engine', 'bridge') {
            foreach ($t in Get-ChildItem (Join-Path $root "tests\$dir") -Filter 'test_*.py') {
                Write-Host "==> $dir\$($t.Name)" -ForegroundColor Cyan
                & $py $t.FullName
                if ($LASTEXITCODE -ne 0) { $failed += "$dir\$($t.Name)" }
            }
        }
        if ($failed) { throw "failed: $($failed -join ', ')" }
        Write-Host 'All engine and bridge tests passed.' -ForegroundColor Green
    }
    'pair'    { if (-not $Device -or -not $Code) { throw 'pair -Device <address:port> -Code <six digits>' }; Invoke-Adb pair $Device $Code }
    'connect' { if (-not $Device) { throw 'connect -Device <address:port>' }; Invoke-Adb connect $Device; Invoke-Adb devices -l }
    'apk'     { Invoke-Gradle }
    'install' { Install-App }
    'run' {
        Install-App
        # the page: from this PC (mini.ps1 serve) with -Dev, else from the APK ("" clears a kept one)
        $url = ''
        if ($Dev) {
            $ip  = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like '192.168.*' } | Select-Object -First 1).IPAddress
            $url = "http://$($ip):$Port/index.html"
            Write-Host "page from $url (is .\mini.ps1 serve running?)" -ForegroundColor Cyan
        }
        Invoke-Adb shell am start -S -n "$app/.MainActivity" --es url "'$url'"
    }
    'bench' {
        # offline renders on the tablet (about a minute); the results come back through logcat
        Install-App
        Invoke-Adb logcat -c
        Invoke-Adb shell am start -S -n "$app/.MainActivity" --ez bench true
        Write-Host 'benching on the tablet...' -ForegroundColor Cyan
        $deadline = (Get-Date).AddMinutes(5)
        do {
            Start-Sleep -Seconds 5
            $lines = & $adb logcat -d -s AmmoMini:I
        } until (($lines -match 'bench done') -or (Get-Date) -gt $deadline)
        $lines | Where-Object { $_ -match 'bench ' -and $_ -notmatch 'bench done' } | ForEach-Object { ($_ -split 'AmmoMini\s*:\s*', 2)[1] }
    }
    'log' {
        Assert-Device
        & $adb logcat -s AmmoMini:V AndroidRuntime:E DEBUG:V
    }
    'shot' {
        Assert-Device
        $png = Join-Path $build 'shot.png'
        & cmd /c "`"$adb`" exec-out screencap -p > `"$png`""
        Write-Host "saved $png" -ForegroundColor Green
    }
    'serve' {
        $ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like '192.168.*' } | Select-Object -First 1).IPAddress
        Write-Host "http://$(if ($ip) { $ip } else { 'localhost' }):$Port/dev.html  (Ctrl+C stops)" -ForegroundColor Cyan
        & $py -m http.server $Port --directory (Join-Path $root 'web') --bind 0.0.0.0
    }
}
