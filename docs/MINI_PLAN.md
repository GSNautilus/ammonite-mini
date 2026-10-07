# Ammonite Mini: plan

Started 2026-10-07. Ammonite Desktop's engine and control panel as an
Android app for one tablet. Read this, then `README.md`. In the `ammonite`
repo, `docs/DESKTOP_PLAN.md` and `docs/PHASE4_BREADTH.md` describe the
engine and the page this started from.

## 0. Status

- 2026-10-07, **the repo.** A snapshot of `engine/`, `web/` and
  `tests/engine/` from `ammonite` `efc533a`, unchanged, and this plan.
  Nothing builds yet. Next: phase 0.

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
  `desktop`); engine fixes are carried across by hand and noted in the
  README. Local only for now: no GitHub.
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
 engine/ C++ (unchanged snapshot) <- Oboe audio callback (an A78 core)
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
engine/          the snapshot (changes noted in README)
bridge/          Bridge.hpp / Bridge.cpp
web/             the page (index.html, app.js, app.css, knobs.js, dev.html, fake-engine.js)
android/         Gradle project: app/ (Kotlin), app/src/main/cpp/CMakeLists.txt -> ../../engine, ../../bridge
tests/engine/    the desktop's engine tests, unchanged
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

- **Layout shape** (phase 0): two columns, or the desktop's accordion made
  bigger.
- **Fine-adjust gesture** (phase 0).
- **CPU fixes** listed in `PHASE4_BREADTH.md`: skip muted channels' voices,
  and stop running all six chord voices when idle. Make them here, or in
  `ammonite` and carry them across? Only if phase 1's bench needs them.
- **Channel cap** (phase 1 bench).
- **MIDI in or out** (USB / BLE, `android.media.midi`) and **Ableton Link**:
  later, if at all.
- **Whether the S Pen's hover shows the tooltips** dropped for fingers.

## 7. Working rules

- Commands given to the user are **PowerShell**. The agent's own shell is
  Git Bash; Python via the `codex` conda env.
- Commits use the repo-local identity in `.git/config` and end with the
  Co-Authored-By trailer. Never push, tag or release without the user's
  go-ahead (there is no remote yet).
- Never launch multi-agent fan-outs without stating the scale and getting
  an OK first.
- One piece at a time: get it right on the tablet, then the next.
