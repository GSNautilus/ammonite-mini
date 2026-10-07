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

## Status

The page works by touch in Chrome on the tablet (phase 0); the engine builds
on Windows and passes the desktop's engine tests (phase 1, step 1). No
Android app yet. The build plan and its status: `docs/MINI_PLAN.md`.

## Building and testing (Windows)

Visual Studio Build Tools 2022 (MSVC, CMake, Ninja), as for desktop:

```powershell
.\mini.ps1 build   # build\cmakeinmmonite_engine.dll
.\mini.ps1 test    # build, then tests\engine	est_*.py against it
```

Python is the `codex` conda env's (or `$env:AMMONITE_PYTHON`).

## Trying the page on the tablet

With the PC and the tablet on the same network:

```powershell
.\mini.ps1 serve
```

then open the address it prints, `http://<the PC's IP>:8010/dev.html`, in
Chrome on the tablet (the page with a stand-in engine, no sound).
