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

Snapshot only: nothing builds yet. The build plan is `docs/MINI_PLAN.md`.

## Trying the page on the tablet

With the PC and the tablet on the same network:

```powershell
conda activate codex; python -m http.server 8000 --directory web --bind 0.0.0.0
```

then open `http://<the PC's IP>:8000/dev.html` in Chrome on the tablet
(the page with a stand-in engine, no sound).
