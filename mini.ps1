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
  .\mini.ps1 serve
  The page for a browser on this PC or the tablet:
  http://<this PC's IP>:<Port>/dev.html (default port 8010).
#>
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('build', 'test', 'serve')]
    [string]$Action,
    [int]$Port = 8010
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
        foreach ($t in Get-ChildItem (Join-Path $root 'tests\engine') -Filter 'test_*.py') {
            Write-Host "==> engine\$($t.Name)" -ForegroundColor Cyan
            & $py $t.FullName
            if ($LASTEXITCODE -ne 0) { $failed += "engine\$($t.Name)" }
        }
        if ($failed) { throw "failed: $($failed -join ', ')" }
        Write-Host 'All engine tests passed.' -ForegroundColor Green
    }
    'serve' {
        $ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like '192.168.*' } | Select-Object -First 1).IPAddress
        Write-Host "http://$(if ($ip) { $ip } else { 'localhost' }):$Port/dev.html  (Ctrl+C stops)" -ForegroundColor Cyan
        & $py -m http.server $Port --directory (Join-Path $root 'web') --bind 0.0.0.0
    }
}
