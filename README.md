# Ammonite Mini

Ammonite Desktop on an Android tablet (target: Samsung Galaxy Tab S6 Lite
2024, SM-P620): the same engine and the same control panel, with no 3D
stage, laid out for touch.

## Where it came from

A snapshot of the `ammonite` repo, branch `desktop`, commit `efc533a`
(2026-10-06, "Desktop phase 4: bloom, the last stage FX"):

| here | there |
|---|---|
| `engine/` | `desktop/engine/` |
| `web/` | `desktop/plugin/web/` |
| `tests/engine/` | `desktop/test/tests/engine/` |

From here on the two copies are separate. Engine fixes made in `ammonite`
are carried across by hand when they matter; note each one here.

Changes to `engine/` since the snapshot:

| date | file | change |
|---|---|---|
| 2026-10-07 | `Engine.cpp` | `ScopedFlushToZero` on ARM64 (FPCR.FZ); x86 unchanged |

## Status

The app plays on the tablet: the page full screen in a WebView, driving the
engine through the bridge (`bridge/`), sound through Oboe (phases 0-2).
Patch files and recordings are wired but not finished (phase 3). The build
plan and its status: `docs/MINI_PLAN.md`.

## Building and testing (Windows)

Visual Studio Build Tools 2022 (MSVC, CMake, Ninja), as for desktop:

```powershell
.\mini.ps1 build   # build\cmake\bin\ammonite_engine.dll
.\mini.ps1 test    # build, then tests\engine\test_*.py against it
```

Python is the `codex` conda env's (or `$env:AMMONITE_PYTHON`).

## The Android app

Android Studio (its JDK and SDK Manager: SDK platform 35, NDK, CMake,
Platform-Tools); Gradle comes with the wrapper in `android/`. The tablet over
Wireless debugging (Developer options), paired once:

```powershell
.\mini.ps1 pair -Device <address:port of "Pair device with pairing code"> -Code <code>
.\mini.ps1 connect -Device <address:port on the Wireless debugging screen>
.\mini.ps1 run     # build, install, start: it plays the default preset
.\mini.ps1 bench   # the engine's render times on the tablet
.\mini.ps1 log     # logcat, the app's lines
```

After pairing, adb usually finds the tablet by itself (mDNS) whenever
Wireless debugging is on.

## Trying the page on the tablet

With the PC and the tablet on the same network:

```powershell
.\mini.ps1 serve
```

then open the address it prints, `http://<the PC's IP>:8010/dev.html`, in
Chrome on the tablet (the page with a stand-in engine, no sound).
