# Ammonite Mini

Ammonite Desktop on an Android tablet (target: Samsung Galaxy Tab S6 Lite
2024, SM-P620): the same engine and the same control panel, with no 3D
stage, laid out for touch.

## Where it came from

The `ammonite` repo, branch `desktop`:

| here | there | as of |
|---|---|---|
| `engine/` | `desktop/engine/` | `69f0980` (2026-10-13), identical |
| `tests/engine/` | `desktop/test/tests/engine/` | `69f0980`, identical |
| `web/` | `desktop/plugin/web/` | `efc533a` (2026-10-06), adapted for touch (phase 0) |
| `bridge/` | from `desktop/plugin/AmmoniteUI.cpp` | `69f0980` |

**The engine is identical to `ammonite`'s `desktop/engine` at `69f0980`**,
copied whole with its tests: the modulation pool (32 LFOs, 16 macros, 128
routes), version 3 patches (version 2 ones convert on load), the Custom
progression, Fine tune, the CPU meter's field in the telemetry. Mini's one
engine change (2026-10-07: `ScopedFlushToZero` on ARM64, FPCR.FZ) now lives
upstream, so there is nothing to re-apply: to update, copy both folders
again and run `mini.ps1 test`. Engine fixes are made in `ammonite`.

The page is still the `efc533a` one: it ignores what it does not know (the
pool, the custom steps, the new telemetry). It is replaced by the shared
page (one page in `ammonite` with a Mini mode: `docs/MINI_PLAN.md`, "LFOs
and modulation").

## Status

The app plays on the tablet: the page full screen in a WebView, driving the
engine through the bridge (`bridge/`), sound through Oboe (phases 0-2).
Patch files and recordings are wired but not finished (phase 3). Desktop's
engine with the modulation pool (2026-10-13) passes its tests on Windows
and compiles for the tablet, but has not been on it yet. The build plan and
its status: `docs/MINI_PLAN.md`.

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
