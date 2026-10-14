# Ammonite Mini: plan

Started 2026-10-07. Ammonite Desktop's engine and control panel as an
Android app for one tablet. Read this, then `README.md`. In the `ammonite`
repo, `docs/DESKTOP_PLAN.md` and `docs/PHASE4_BREADTH.md` describe the
engine and the page this started from.

## 0. Status

- 2026-10-07, **the repo.** A snapshot of `engine/`, `web/` and
  `tests/engine/` from `ammonite` `efc533a`, unchanged, and this plan.
  Nothing builds yet. Next: phase 0.
- 2026-10-07, **phase 0 done: the page, for touch, without the stage.**
  Tried by the user on the tablet in Chrome (finger and S Pen); layout
  approved.
  - Out: `shells.js`, the stage canvas and frame code, the camera and its
    gestures, the motion layer, the Visual tab, the eye toggle, the
    channel's VISUAL group, the stage FX, the rail and the dock button.
    The patch's page line (`ammo.page`) is kept whole as it came and
    written back on a save, so desktop's stage settings make the round
    trip. The engine's stage parameters (`show`) are untouched.
  - Layout: the desktop's accordion (Conductor / Channels tabs), filling
    the screen, designed 900 high: 0.89 on the tablet. A two-column
    prototype (list + card) was tried and not taken.
  - Touch: every target at least 54 layout px (48 CSS px); no page zoom,
    selection or pull-to-refresh; a 4 px dead zone before a drag; a
    double-tap resets; a second finger held anywhere makes a drag fine
    (1/4), and moves, ends or clicks nothing itself. Hover looks only with
    a mouse. Shift, the wheel and the keyboard shortcuts stay.
  - Sync is hidden (internal clock only). Channel names at 20 px, as
    desktop's uncommitted change.
  - The fake engine no longer fakes stage values; its URL options are
    `preset tab open secs grps single`. Page state is kept under
    `ammo.mini.ui`, apart from desktop's.
  - Checked by synthetic pointer events in headless Edge (not in the
    repo). Served on port 8010 while desktop's page server holds 8000.
  - Next: phase 1.
- 2026-10-07, **phase 1, step 1: the engine on Windows.** `CMakeLists.txt`
  (the engine DLL, as desktop's) and `mini.ps1 build | test | serve`. All
  11 `tests/engine` files pass against `build/cmake/bin/ammonite_engine.dll`,
  unchanged (`mini.ps1` points them at it with `AMMO_ENGINE_DLL`). `serve`
  uses port 8010. Next: the user installs the Android tools (step 2).
- 2026-10-07, **phase 1 done: sound on the tablet, and the bench.**
  - Tools: Android Studio (JDK 25), SDK 35, NDK 30, CMake 4.1.2; Gradle 9.8.1
    (wrapper), AGP 9.4.1, Oboe 1.11.0 (prefab). The tablet: Android 16 (API
    36), paired over Wireless debugging (`mini.ps1 pair | connect`).
  - Engine change: `ScopedFlushToZero` on ARM64 (README).
  - The stream: AAudio, 48 kHz, low latency, bursts of 96 frames (2 ms), a
    192-frame buffer (4 ms); the callback on cpu 6-7 (the A78s, 2.4 GHz).
  - **Correction (phase 2, same day): these runs played silence.** AAudio's
    MMAP path, exclusive or shared, runs on this tablet (callbacks, no xruns,
    the speaker "playing") but nothing is heard. Nobody had listened until
    phase 2. The app now switches MMAP off and plays through the mixer
    (bursts of 192 frames, an 8 ms buffer); the live numbers below were
    re-measured there (phase 2 entry). The offline bench is unaffected.
  - 10 minutes of the default patch (First light), exclusive: 0 xruns,
    callback load 6.5 % mean, 15.7 % worst (633 s).
  - Bench, offline, 10 s at 48 kHz in 192-frame blocks on a big core (after a
    5 s settle: just after a launch there are spikes that are not ours):

    | patch | per 10 s | real time | worst block |
    |---|---|---|---|
    | default (First light, 3 ch) | 0.20 s | 2.0 % | 4 % |
    | 16 ch, every effect (drive, chorus, delay, reverb, duck) | 1.61 s | 16.1 % | 20 % |
    | 16 chord channels (9ths in steps: 80 voices sounding) | 2.91 s | 29.1 % | 41 % |

    96-frame blocks cost the same (16.5 %, 29.4 %): no per-block overhead to
    speak of.
  - Live, the same heavy patches for 2 min each: 0 xruns, but the callback's
    load reads 42 % (every effect) and 64-66 % (chords), worst 79 %. Not the
    engine: the governor runs the big cores at 1.0-1.7 GHz while there is
    room, so the load is of a slowed core. The performance hint (Oboe ->
    ADPF) is not supported on this tablet (`PowerHintSessions are not
    supported`); it is enabled anyway, and changes nothing (A/B, 90 s each).
  - **Decided by these:** no channel cap (16 stay); the CPU fixes in
    section 6 wait. If dropouts come with the page running (phase 2), first
    a larger buffer (2 -> 4 bursts, 8 ms), then the fixes.
  - The bridge (phase 2, step 1) was done alongside: see the next entry.
- 2026-10-07, **phase 2, step 1: the bridge.** `bridge/` (Bridge.hpp/.cpp,
  bridge_api.h): desktop's `AmmoniteUI.cpp` message handling and ticks with
  no platform code, in the Windows DLL. `tests/bridge/test_bridge.py`
  (ready, set, the tick's shape, the transport, presets, save / open through
  the platform's picker, recording) passes with the engine tests. Changes
  from desktop: parameters straight to the engine; the transport (Space,
  the play button) is the bridge's, since the internal clock never stops:
  stopped, the audio outputs silence and the music waits where it was;
  patch files through the platform (`PatchText`, `Saved`, `Opened`).
  Next: step 2, the WebView with the page and JNI to the bridge.
- 2026-10-07, **phase 2, step 2: the page in the app.** The app is a
  full-screen WebView with the page from the APK's assets (Gradle reads
  `web/`; `WebViewAssetLoader`), or from the PC with `mini.ps1 run -Dev`.
  Page -> native through a `WebMessageListener` (`ammoHost`, androidx.webkit
  1.17.1); native -> page by `evaluateJavascript`; ticks once per display
  frame (Choreographer). The bridge now folds the tablet's 500 blocks a
  second into at most six frames a tick (hits, ducking and timing kept,
  waves in the last), and tells the page of a play / stop even when no frame
  comes. Save / Open go through Android's pickers; recordings to the app's
  Music folder (phase 3 finishes both).
  - **No sound, then sound.** The exclusive stream was silent (phase 1's
    correction); a shared request still landed on the MMAP path, silent too.
    The app now calls Oboe's `OboeExtensions::setMMapEnabled(false)` (Oboe
    marks it "for testing"; the only way to keep AAudio's low latency
    without MMAP), so the stream goes through the mixer: AAudio, 48 kHz,
    bursts of 192 frames (4 ms), an 8 ms buffer. The status line names the
    path ("MMAP" / "legacy (mixer)"); `--ez exclusive true` allows MMAP
    again. Heard by the user.
  - Through the mixer, the page running, 1 min each:

    | patch | load mean | worst | xruns |
    |---|---|---|---|
    | default (First light) | 3.6 % | 10.1 % | 1 at start |
    | 16 ch, every effect | 22.3 % | 39.5 % | 1 at start |
    | 16 chord channels | 39.6 % | 60.7 % | 1 at start |

    The one xrun is counted as the stream opens (before its first
    callback) and never grows. No channel cap.
  - Device checks are kept short now (a minute or two per patch).
- 2026-10-07, **phase 2 done.** The user, on the tablet: knobs and presets
  work, a knob turn has no felt delay, presets switch cleanly. Next: phase 3
  (Save / Open are wired to the pickers already; the round trip with
  desktop, and recordings out to Music).
- 2026-10-13, **the port, step 1: desktop's engine, and the bridge to
  match** (`ammonite` `PHASE4_BREADTH.md` 8.8, decision 1). Done without
  the tablet.
  - `ammonite` `69f0980` (branch `desktop`): Mini's ARM64 flush-to-zero
    added to desktop's `Engine.cpp` (x86 unchanged, every engine test
    passes there). `engine/` and `tests/engine/` are now copies of
    `desktop/engine` and `desktop/test/tests/engine` at that commit,
    byte for byte (there were no Mini test changes to keep); README.
  - The bridge, from `AmmoniteUI.cpp` `efc533a..69f0980`:
    - `ready` sends every saved id (1852: the 1340 host parameters and the
      128 x 4 route ids), as desktop now does; a preset or an opened file
      sets them all, routes included.
    - `set` takes the route ids too, straight into the engine (desktop
      also writes them to the plugin's `routes` state for a DAW; Mini has
      none: the engine's patch text carries them, version 3).
    - Ticks gain `lf` (the LFOs that ran: `{index: -1..1}`), `rt` (the
      live routes' positions: `{route: 0..1}`) and `cpu` (the engine's time
      over the block's), desktop's fields. A frame that folds several
      blocks (section 0, phase 2) carries their length-weighted mean as
      `cpu` and their worst as **`cpk`** (Mini's own field); `lf` and `rt`
      are its last block's.
    - Not taken: the output device (`outputs`, `output <id>`,
      `ammo.outputs`: desktop's standalone host's; ignored here, and the
      page shows no picker without `ammo.outputs`), and the DAW-only
      `stateChanged` / `setState`. `gl ...` lines are logged.
    - `tests/bridge/test_bridge.py` covers all of it (the table, route
      `set` and clamping, `lf` / `rt` / `cpu` / `cpk`, folded frames
      against an engine read block by block, a route through save and
      open, the desktop-only messages).
  - `mini.cpp`: a fourth bench patch, "16 ch, fx, whole pool" (16 channels
    with every effect, 32 LFOs, 128 routes, as `test_mod.py`'s CPU check),
    and `--ei patch 3` plays it live.
  - Checked: `mini.ps1 test` (12 engine files, the bridge) passes; the
    whole pool costs 6.9 % of real time on the PC (engine's meter 6.7 %).
    `mini.ps1 apk` builds (arm64-v8a, the native code recompiled with
    `-Wall`: one warning, `hostClockSeen_` unused, as before). The current
    page, fed the new bridge's own output (ready, Slow tide, 4 s of ticks)
    in headless Edge: no errors, it plays (waves, chords); it lists the
    Custom progression but draws it as one chord, with no step editor.
  - **Waits for the tablet:**
    1. `mini.ps1 bench`: the new "16 ch, fx, whole pool" row against
       "16 ch, every effect" (desktop: the whole pool is 7 % of one x86
       core), at 192 and 96 frames.
    2. The pool live: `--ei patch 3` with the page running, a minute or
       two (xruns, the callback's load).
    3. A 10-minute run of the default patch with no dropout, as phase 1.
    4. The presets by ear, the ten of them: their LFOs and macro routes
       are new to the tablet (Slow tide's three LFOs, Dub echoes, Evening
       band, Night groove, Slow bloom).

## 1. What it is

The desktop's synth (16 channels, the conductor, generators, instruments,
effects, master bus) and its control panel, on a Samsung Galaxy Tab S6 Lite
2024 (SM-P620), played by finger and S Pen. **No 3D stage.** The panel gets
the whole screen.

The tablet: Exynos 1280 (2x Cortex-A78 at 2.4 GHz + 6x Cortex-A55), Mali-G68
MP4, 4 GB RAM, 10.4" 2000x1200 (about 1333x800 CSS px at Android's default
scaling).

## 2. Decided

- **A separate repo.** A snapshot of `ammonite` at `efc533a` (branch
  `desktop`). Since 2026-10-13 the engine is a plain copy of desktop's
  (README), refreshed by copying it again; the page follows when it is
  shared (section 6, "LFOs and modulation"). Local only for now: no GitHub.
- **A native app:** Kotlin, an Android WebView with the page in it, the engine
  through the NDK and JNI, and Oboe (AAudio) for audio. It has the same shape
  as the desktop: C++ engine, web page, one-line string messages.
- **No stage.** `shells.js`, the stage canvas, the Visual tab and the
  per-channel "show in visualizer" toggle are dropped. The stage parameters
  stay in the engine and in patch files, unchanged, so a patch makes the
  round trip desktop -> tablet -> desktop without losing its looks.
- **The patch format is the desktop's:** `.ammo` = the engine chunk + the
  `page {json}` line.
- **Internal clock only.** No host, so `sync` is fixed at Internal and
  hidden.
- **Landscape only.**
- **Everything runs from a script.** `mini.ps1` builds, tests, installs and
  starts the app on the tablet, as `desktop.ps1` does for the desktop.
  Android Studio is optional (for debugging).

## 3. Architecture

```
 web/ (the page, in the WebView)
   |  page -> native: one-line strings, as on desktop (ready | set <id> <v> | preset <k> | save <json> | ...)
   |  native -> page: ammo.params(...) ammo.values(...) ammo.tick(...) ...
 android/ Kotlin: MainActivity + WebView, file picker, foreground service
   |  JNI: strings in, strings out
 bridge/ C++, no platform code: the desktop's AmmoniteUI.cpp logic
   |  (OnMessage, SendParams/Values/Presets, Tick, PageLine)
 engine/ C++ (desktop's, copied whole) <- Oboe audio callback (an A78 core)
```

- **bridge/** is the portable part of `desktop/plugin/AmmoniteUI.cpp`, pulled
  out:
  - It takes the page's messages and returns the JavaScript to run.
  - The platform does the rest through callbacks: run JS, show a save or open
    picker, give a recording path, show a toast.
  - It is built into the Windows DLL too, so Python tests drive it with no
    tablet.
- **Page <-> native:**
  - The page's `bridge` (`app.js:32`, now `window.chrome.webview`) gets a
    small adapter for an Android `WebMessageListener` (androidx.webkit).
  - Native -> page is `evaluateJavascript`.
  - Ticks are paced by the display (Choreographer) and sent only when the
    engine has published a new frame.
- **Audio:** an Oboe stream in low-latency, exclusive mode at the device
  rate, which the engine already handles (`ammo_create(rate, maxBlock)`, any
  block size). The callback calls `ammo_process` with a clock that is not
  valid (Internal). The audio thread is pinned to a big core, and the
  workload is reported through Android's performance-hint API so the CPU
  clocks don't drop under it.
- **Telemetry:** stays as on desktop, waves included. The panel's section
  views and rail dots draw them. If the bridge is slow, send waves only for
  the channels that are open.
- **During development the page loads from the PC.** A debug setting points
  the WebView at `http://<PC>:8000/index.html`, the Android counterpart of
  desktop's `AMMO_WEB_DIR`. Page edits then need a reload, not a reinstall.
  A release build loads the page from the APK's assets: Gradle reads `web/`
  directly, with no copy.

Repo layout when built:

```
engine/          desktop's engine, copied whole (README names the commit)
bridge/          Bridge.hpp / Bridge.cpp
web/             the page (index.html, app.js, app.css, knobs.js, dev.html, fake-engine.js)
android/         Gradle project: app/ (Kotlin), app/src/main/cpp/CMakeLists.txt -> ../../engine, ../../bridge
tests/engine/    the desktop's engine tests, copied with it
tests/bridge/    the bridge, headless (ctypes, as the engine tests)
CMakeLists.txt   Windows: the engine + bridge DLL for the tests (MSVC + Ninja, as desktop)
mini.ps1         build | test | apk | install | run | serve | shot | log
```

## 4. Phases

Each phase ends with something to try on the tablet and a short status
entry, dated, in section 0.

### Phase 0: the page, for touch, without the stage

No Android tools needed. The page runs in Chrome on the PC and on the
tablet (`mini.ps1 serve`, then `http://192.168.1.2:8000/dev.html`), with
the fake engine.

1. **Out:** `shells.js`, the stage canvas and its frame code, the stage's
   gestures (orbit, wheel zoom, double-click reset), the Visual tab, the eye
   toggle and the stage FX settings. The fake engine stops faking stage
   values.
2. **Layout:** the panel fills the screen at 1333x800 CSS px.
   - It is now drawn at `LAYOUT_H = 1440` with `PANEL_W = 1336`, which on
     this screen is a 0.56 scale and too small.
   - Candidate: the channel list on the left, the open channel's card filling
     the rest, at about 0.8-0.9 scale.
   - Settled with the user by screenshots before building it out.
3. **Touch:**
   - `touch-action: none` on controls; no text selection, page zoom or
     pull-to-refresh (viewport meta, `overscroll-behavior: none`).
   - Hit targets of at least 48 CSS px, about 9 mm.
   - Fine adjustment without Shift (a second finger held down, or the S Pen
     button).
   - Double-tap a knob to reset it to its default.
   - Tooltips (`title`) are dropped where they are the only label.
4. Keyboard shortcuts stay: they do no harm, and the book cover keyboard
   uses them.

Done when every control is reachable and usable on the tablet by finger
and S Pen in Chrome, and the user signs off on the layout.

### Phase 1: the engine on Windows, then sound on the tablet

1. A `CMakeLists.txt` for the engine DLL (MSVC + Ninja, found as
   `desktop.ps1` finds them). `mini.ps1 test` runs `tests/engine/*` and they
   all pass, as on desktop. They are the guard against drift from the
   snapshot.
2. **Tools (the user installs these, about 6-8 GB):**
   - Android Studio, which brings JDK 17 and the SDK manager.
   - SDK platform 35, NDK, CMake.
   - On the tablet: Developer options -> USB debugging or Wireless
     debugging.
3. **A minimal app:** Oboe stream + engine, the default preset playing, no
   page. A bench screen renders offline on the device and reports the time
   per 10 s of audio for:
   - the default patch;
   - 16 channels with every effect on;
   - 16 chord channels (96 voices).

   It also reports the audio callback's load while playing.

Done when the default patch plays for 10 minutes without a dropout, and
the bench numbers are recorded here. They decide whether channels are
capped (now 16) and whether the CPU fixes in section 6 come first.

### Phase 2: the bridge, the app as a whole

1. `bridge/` out of `AmmoniteUI.cpp`, with `tests/bridge/` checking:
   - `ready` -> params, values and presets;
   - `set` -> the engine's value;
   - the shape of a tick;
   - preset switching.
2. Kotlin: the WebView (page from the PC in debug, from assets in release),
   the message adapter, ticks paced by Choreographer, JNI to the bridge.
3. The page's adapter at `app.js:32`.

Done when the whole panel plays the engine on the tablet, a knob turn is
heard without a felt delay, and presets switch cleanly.

### Phase 3: patches and recording

1. **Save / Open `.ammo`** through the Android file picker
   (`ACTION_CREATE_DOCUMENT` / `ACTION_OPEN_DOCUMENT`). Byte-compatible with
   desktop, and the stage settings in the page line are kept as they were.
   Checked by a desktop -> tablet -> desktop round trip.
2. **Record:**
   - The engine's `RecordTap` writes to the app's own folder (plain
     `fopen`, so `Record.hpp` is unchanged).
   - On stop, the file is copied to Music/Ammonite (MediaStore) and
     offered to share.

### Phase 4: living on the tablet

1. **Playing with the screen off:** a foreground service with a playing
   notification (play/stop).
2. **Audio focus:** stop for a call or another app's audio.
3. **Device changes** (headphones, Bluetooth, a USB interface): restart the
   Oboe stream at the new rate (44.1 / 48 kHz; the engine re-inits its
   buffers off the audio thread).
4. **Heat:** a CPU meter in the page from the callback's load; the
   performance hint.
5. An icon, a name, and a signed release APK for sideloading
   (`mini.ps1 apk`).

## 5. Testing without a DAW or an emulator

- **Engine and bridge:** the Python tests against the Windows DLL, as on
  desktop.
- **The page:** `dev.html` + the fake engine, in desktop Chrome and on the
  tablet.
- **The device**, through adb from `mini.ps1`:
  - `install` / `run`;
  - `log` (logcat filtered to the app);
  - `shot` (`adb exec-out screencap -p` to a PNG the agent can look at);
  - the page's console through `chrome://inspect` on the PC.
- **No emulator:** the audio, CPU and touch questions are all about the
  real tablet.

## 6. Open (settle when the phase needs it)

- ~~Layout shape~~ (phase 0): the desktop's accordion made bigger.
- ~~Fine-adjust gesture~~ (phase 0): a second finger held.
- **CPU fixes** listed in `PHASE4_BREADTH.md`: skip muted channels' voices,
  and stop running all six chord voices when idle. Make them here, or in
  `ammonite` and carry them across? Phase 1's bench does not need them
  (section 0); only if the app glitches with the page running.
- ~~Channel cap~~ (phase 1 bench): none, 16 channels.
- **Play / stop** (phase 2): the bridge's transport stops dead (silence, the
  music waits). A fade, or stop going back to the bar's start, if wanted.
- **MIDI in or out** (USB / BLE, `android.media.midi`) and **Ableton Link**:
  later, if at all.
- **Whether the S Pen's hover shows the tooltips** dropped for fingers.
- **LFOs and modulation** (asked for 2026-10-09; built on desktop first,
  then here). Desktop has it: two LFOs and four routes per channel, two
  global LFOs, the macros routed in every preset, an assign mode (tap
  Assign, tap the knobs it should move, drag from one to set the amount,
  tap it again to remove). The design and what porting it takes are in
  `ammonite`'s `docs/PHASE4_BREADTH.md` sections 7 and 8 (7.5 and 8.8 are Mini's part; section 8, agreed 2026-10-13, redesigns it: a pool of sources, a Modulation tab, amounts on tags, a pin bar, an oscilloscope view that suits Mini, which has no 3D stage).
  **Decided 2026-10-13** (the port; details in `ammonite`'s
  `PHASE4_BREADTH.md` 8.8): (1) copy desktop's `engine/` whole, re-apply
  this repo's engine changes (the table in `README.md`), give the bridge
  what `AmmoniteUI.cpp` gained (`lf`, `rt`, `lfoRun`, `cpu`, the route
  messages), bench the full pool on the tablet (**done 2026-10-13** but
  for the tablet steps, section 0; the ARM64 change went upstream instead
  of being re-applied); (2) **the page is shared**:
  one page in `ammonite` with a Mini mode doing what phase 0 did here, which
  this repo takes as it is (no more porting page features by hand);
  (3) **the scope is full screen**: a Scope view from the top bar, the
  panel sliding away, the pinned knobs under it when the pin drawer is
  open; its GPU path brought back without the 3D form, stage FX measured
  on the tablet, a 2D canvas as the fallback. Tablet steps wait for the
  user to switch the tablet on.
  **What the shared page's Mini mode needs to know** of this bridge
  (`bridge/Bridge.hpp`): `ammo.info` has `fmt: "android"` and the host
  object is `window.ammoHost`; no `ammo.outputs` ever comes (desktop's
  output picker stays hidden, `outputs` / `output` are ignored); ticks
  carry at most six frames, waves in the last only, and a folded frame's
  `cpu` is its blocks' mean, `cpk` their worst (the CPU meter's peak
  should read `cpk` when there is one); `h` is always 0 and the
  transport is the bridge's (`key 1 32 0` toggles, ticks say `p`); routes
  are set by `set <id> <v>` like any parameter and saved by the engine's
  patch text (no `routes` state, no re-send of values after a project
  load); `edit` is ignored; `gl ...` is logged.

## 7. Working rules

- Commands given to the user are **PowerShell**. The agent's own shell is
  Git Bash; Python via the `codex` conda env.
- Commits use the repo-local identity in `.git/config` and end with the
  Co-Authored-By trailer. Never push, tag or release without the user's
  go-ahead (there is no remote yet).
- Never launch multi-agent fan-outs without stating the scale and getting
  an OK first.
- One piece at a time: get it right on the tablet, then the next.
