# Ammonite Mini

Ammonite Desktop on an Android tablet (target: Samsung Galaxy Tab S6 Lite
2024, SM-P620): the same engine and the same page, with no 3D stage, laid
out for touch (the page's Mini mode).

## Where it came from

The `ammonite` repo, branch `desktop`:

| here | there | as of |
|---|---|---|
| `engine/` | `desktop/engine/` | `69f0980` (2026-10-13), identical |
| `tests/engine/` | `desktop/test/tests/engine/` | `69f0980`, identical |
| `web/` | `desktop/plugin/web/` | `45ac1c0` (2026-10-13): `app.js`, `app.css`, `knobs.js`, `fake-engine.js` identical (`web/SHARED.txt`); `index.html`, `dev.html` Mini's own |
| `bridge/` | from `desktop/plugin/AmmoniteUI.cpp` | `69f0980` |

**The engine is identical to `ammonite`'s `desktop/engine` at `69f0980`**,
copied whole with its tests: the modulation pool (32 LFOs, 16 macros, 128
routes), version 3 patches (version 2 ones convert on load), the Custom
progression, Fine tune, the CPU meter's field in the telemetry. Mini's one
engine change (2026-10-07: `ScopedFlushToZero` on ARM64, FPCR.FZ) now lives
upstream, so there is nothing to re-apply: to update, copy both folders
again and run `mini.ps1 test`. Engine fixes are made in `ammonite`.

**The page is shared:** `ammonite`'s `desktop/plugin/web` is the one page
of both apps. Mini's `index.html` and `dev.html` set `window.AMMO_MINI =
true` before any script loads, which puts the page in its Mini mode: no
stage, the panel filling the screen at 0.89, touch rules (48 CSS px
targets, a dead zone, double-tap reset, a second finger for fine drags,
long presses for menus), Sync and the output picker hidden, the pin bar as
a drawer along the bottom (`ammonite`'s `docs/PHASE4_BREADTH.md` 8.8, "As
built"). Everything else in `web/` is a copy, never edited here.

To update the page (after a change in `ammonite`, committed there):

```powershell
.\mini.ps1 web    # copies the shared files from ..mmonite, records the commit in web\SHARED.txt
.\mini.ps1 test   # the engine and bridge tests, and the copies checked against web\SHARED.txt
.\mini.ps1 apk    # the APK with the new page (Gradle packages web\)
```

A page change is made in `ammonite` (desktop mode must not change), never
in `web/` here: `mini.ps1 test` fails on a copy that differs from what
`SHARED.txt` recorded.

## Status

The app plays on the tablet: the page full screen in a WebView, driving the
engine through the bridge (`bridge/`), sound through Oboe (phases 0-2).
Patch files and recordings are wired but not finished (phase 3). Desktop's
engine with the modulation pool and the shared page with its Modulation
tab, pin drawer and CPU meter (2026-10-13) pass their tests on Windows and
in headless Edge at the tablet's size, and build into the APK, but have not
been on the tablet yet. The build plan and its status: `docs/MINI_PLAN.md`.

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
