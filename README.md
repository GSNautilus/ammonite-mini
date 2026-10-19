<h1 align="center">Ammonite Mini</h1>

<p align="center">
  <b>Ammonite Desktop's synthesizer on an Android tablet</b><br>
  the same engine and the same patches &middot; no 3D stage &middot; the whole panel laid out for touch
</p>

<p align="center">
  <a href="https://github.com/GSNautilus/ammonite-mini/releases/tag/v0.1.0"><b>&#11015; Download Ammonite Mini 0.1.0 (APK)</b></a><br>
  <a href="https://gsnautilus.github.io/ammonite/mini/">The Mini page</a> &middot;
  <a href="https://gsnautilus.github.io/ammonite/">The Ammonite family</a>
</p>

---

Ammonite is a generative arpeggiator synthesizer: you never pick notes, you
pick a key, a chord progression and, for each channel, which notes of the
chord it may play and in what rhythm. It started as a hardware instrument on
the Daisy Seed ([`ammonite`](https://github.com/GSNautilus/ammonite)), grew
into **Ammonite Desktop** (a Windows plugin and standalone app with up to 16
channels, a modulation pool and a 3D stage that draws the music), and
**Ammonite Mini** is Desktop on a tablet.

## Mini and Desktop

- **The same engine.** `engine/` is Desktop's engine, copied whole and
  unchanged, with its tests: up to 16 channels, the Conductor (key,
  progression, tempo), arps, chords, bass and drums, the modulation pool
  (32 LFOs, 16 macros, 128 routes), the effects.
- **The same patches.** A patch saved on one opens on the other (`.ammo`,
  version 4). Desktop's stage settings travel inside the patch and come back
  untouched when Mini saves it.
- **The same page, in its Mini mode.** Desktop's control panel is a web page;
  Mini shows that page full screen in a WebView, with:
  - no 3D stage (and no Visual tab);
  - every target at least 48 px, a small dead zone before a drag, a
    double-tap to reset a control, a second finger held down for fine
    drags, long presses for menus;
  - the pinned controls as a drawer along the bottom;
  - the internal clock only (no Sync), and the tablet's own audio output.
- **Sound** through [Oboe](https://github.com/google/oboe) (AAudio), at
  48 kHz with an 8 ms buffer on the tablet.

## Install it (sideloading)

Ammonite Mini is not on the Play Store: you install the APK yourself.

Needs **Android 13 or later** on a 64-bit ARM device (arm64-v8a). Made and
tested on a **Samsung Galaxy Tab S6 Lite (2024), SM-P620**, Android 16; other
tablets should work but have not been tried. It is laid out for a landscape
tablet; a phone screen is too small for it.

1. On the tablet, download `Ammonite-Mini-0.1.0.apk` from the
   [release](https://github.com/GSNautilus/ammonite-mini/releases/tag/v0.1.0).
2. Open it (from the browser's downloads, or the My Files app).
3. Android asks to allow installs from this source the first time: tap
   **Settings**, switch on **Allow from this source**, go back, and tap
   **Install**. (Samsung: Settings > Security and privacy > More security
   settings > Install unknown apps, for the browser or My Files.)
4. Play Protect may warn about an app it does not know: **More details >
   Install anyway**.
5. Open **Ammonite Mini**. It starts playing the default patch.

Updates install over it the same way, keeping its settings: every release is
signed with the same key.

From a PC with adb instead:

```powershell
adb install C:\path\to\Ammonite-Mini-0.1.0.apk
```

## Status (0.1.0)

Plays on the tablet: the whole panel, the presets, the modulation pool.
Load and Save go through Android's file picker; a patch's round trip from
Desktop to Mini and back has not been checked yet. Not yet: playing with
the screen off or in the background, pausing for calls and other apps' audio,
following headphones or a USB interface plugged in while it plays, copying
recordings out of the app's own folder (they stay in
`Android/data/com.ammonite.mini/files/Music/Recordings`), and an icon of its
own.

## Where it came from

Copied from the `ammonite` repo's `desktop/` (Ammonite Desktop):

| here | there |
|---|---|
| `engine/` | `desktop/engine/`, identical |
| `tests/engine/` | `desktop/test/tests/engine/`, identical |
| `web/` | `desktop/plugin/web/`: `app.js`, `app.css`, `knobs.js`, `fake-engine.js` identical (the commit in `web/SHARED.txt`); `index.html`, `dev.html` Mini's own |
| `bridge/` | from `desktop/plugin/AmmoniteUI.cpp` |

Engine and page changes are made in `ammonite`, never here. **The engine** is
copied whole with its tests: copy both folders again and run
`mini.ps1 test`. **The page is shared:** Mini's `index.html` and `dev.html`
set `window.AMMO_MINI = true` before any script loads, which puts the page in
its Mini mode. To update it, after
a change committed in `ammonite` (desktop mode must not change):

```powershell
.\mini.ps1 web    # copies the shared files from ..\ammonite, records the commit in web\SHARED.txt
.\mini.ps1 test   # the engine and bridge tests, and the copies checked against web\SHARED.txt
.\mini.ps1 apk    # the APK with the new page (Gradle packages web\)
```

`mini.ps1 test` fails on a copy that differs from what `SHARED.txt` recorded.

## Building and testing (Windows)

Visual Studio Build Tools 2022 (MSVC, CMake, Ninja), as for Desktop:

```powershell
.\mini.ps1 build   # build\cmake\bin\ammonite_engine.dll
.\mini.ps1 test    # build, then tests\engine\test_*.py and tests\bridge against it
```

Python with numpy: `$env:AMMONITE_PYTHON`, else the `codex` conda env's,
else `python`.

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

`apk`, `install` and `run` make the dev build, **Ammonite Mini dev**
(`com.ammonite.mini.dev`, signed with the debug key), which sits beside the
release on the tablet.

### The release APK

```powershell
.\mini.ps1 release            # build\Ammonite-Mini-<version>.apk, signed and checked
.\mini.ps1 release -Install   # and onto the tablet, started
```

The release key is not in this repo. Gradle reads a properties file
(`storeFile`, `storePassword`, `keyAlias`, `keyPassword`) from
`$env:AMMONITE_MINI_SIGNING`, else `~\keys\ammonite-mini-release.properties`;
without one the release APK is built unsigned. A build of your own, signed
with your own key, installs only after uninstalling the published one.

## Trying the page in a browser

```powershell
.\mini.ps1 serve
```

then open the address it prints, `http://<the PC's IP>:8010/dev.html`, on
the PC or in Chrome on the tablet (the page with a stand-in engine, no
sound).

## License

MIT, as Ammonite: see [`LICENSE`](LICENSE).
