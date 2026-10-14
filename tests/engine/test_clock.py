"""The master clock, measured from the audio: step timing per division and
tempo, three grids locked over a minute at an odd tempo, swing, host sync
(steps on the host's beats, a position jump, stop continues at tempo,
internal mode ignores the host)."""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from engine_api import *  # noqa: E402,F403

print(f"== {DLL_PATH}")
DEC_30MS = np.log2(6) / 9.64  # DECAY 30 ms

# ---- step timing (Loop: the same note every step)
for div, bpm, want in [("1/8", 120, 0.25), ("1/8", 60, 0.5), ("1/16", 120, 0.125), ("1/4T", 120, 1 / 3), ("1/4", 137, 60 / 137)]:
    e = Engine()
    e.solo_arp(0, "Loop", div, octave=3, bpm=bpm, dec=DEC_30MS)
    L, R = e.render(4.0)
    iv = np.diff(onsets(L))
    check(len(iv) > 4 and abs(iv.mean() - want) < 0.001 and iv.std() < 0.001,
          f"{div} at {bpm} BPM: steps {iv.mean() * 1000:.1f} ms (want {want * 1000:.1f}), jitter {iv.std() * 1000:.2f} ms")
    e.close()

# ---- the long and the dotted divisions (a step of 4/1 is four bars)
for div, bpm, want, secs in [("1/8.", 120, 0.375, 4.0), ("1/4.", 120, 0.75, 6.0), ("1/2.", 120, 1.5, 9.0), ("2/1", 240, 2.0, 11.0),
                             ("4/1", 240, 4.0, 21.0)]:
    e = Engine()
    e.solo_arp(0, "Loop", div, octave=3, bpm=bpm, dec=DEC_30MS)
    L, _ = e.render(secs)
    iv = np.diff(onsets(L))
    check(len(iv) >= 4 and abs(iv.mean() - want) < 0.001 and iv.std() < 0.001,
          f"{div} at {bpm} BPM: {len(iv)} steps of {iv.mean() * 1000:.1f} ms (want {want * 1000:.1f}), jitter {iv.std() * 1000:.2f} ms")
    e.close()

# a step longer than the restart period counts freely: 2/1, LENGTH 2, half the steps, Restart Bar -> every other step
e = Engine()
e.solo_arp(0, "Loop", "2/1", octave=3, bpm=240, dec=DEC_30MS, length=2)
e.set("arp_density", 0.5, 0)
e.set("restart", 1)
L, _ = e.render(13.0)
iv = np.diff(onsets(L))
check(len(iv) >= 2 and np.allclose(iv, 4.0, atol=0.001), f"2/1 with Restart Bar plays every other step: {np.round(iv, 3)} s (want 4 s apart)")
e.close()

# ---- one clock, three divisions: no drift over a minute at 137 BPM
# (one channel per instance, so the onsets are clean; the clock is the same code)
bps = 137 / 60
worst = 0.0
counts = []
for div in ["1/4T", "1/8T", "1/16"]:
    e = Engine()
    e.solo_arp(0, "Loop", div, octave=3, bpm=137, dec=DEC_30MS)
    L, _ = e.render(60.0)
    lat = e.latency() / SR  # the master limiter's look-ahead: a host shifts the output back by it
    t = onsets(L) - lat
    d = DIV_BEATS[DIVS.index(div)] / bps  # seconds per step
    err = np.abs(t / d - np.round(t / d)) * d
    worst = max(worst, float(err.max()))
    counts.append(len(t))
    e.close()
check(counts[0] >= 205 and counts[1] >= 410 and counts[2] >= 547 and worst < 0.002,
      f"60 s at 137 BPM on 1/4T, 1/8T, 1/16: {counts} onsets (205 / 411 / 548), worst {1000 * worst:.2f} ms off the grid (no drift)")

# ---- swing: even steps longer, odd shorter, pairs unchanged
e = Engine()
e.solo_arp(0, "Loop", "1/8", octave=3, bpm=120, dec=DEC_30MS)
e.set("swing", 0.6)
e.warm(0.5)
L, _ = e.render(4.0)
iv = np.diff(onsets(L))
long_, short = iv[0::2], iv[1::2]
if abs(long_.mean() - 0.25) < abs(short.mean() - 0.25):  # phase of the pairs
    long_, short = short, long_
check(len(iv) > 8 and abs(long_.mean() + short.mean() - 0.5) < 0.004 and 0.28 < long_.mean() < 0.32 and 0.18 < short.mean() < 0.22,
      f"swing 0.6 on 1/8 at 120: steps {1000 * long_.mean():.1f} / {1000 * short.mean():.1f} ms (300 / 200), pairs {1000 * (long_.mean() + short.mean()):.1f} ms, {len(iv)} steps")
e.close()

# ---- host sync
e = Engine()
e.solo_arp(0, "Loop", "1/4", octave=3, bpm=100, dec=DEC_30MS)
e.set("sync", 0)  # host
L, _ = e.render(4.0, clock=(True, 90.0, 0.0))
t = onsets(L)
off = float(np.max(np.abs(t - np.round(t / (60 / 90)) * (60 / 90)))) * 1000 if len(t) else 999
check(len(t) >= 5 and abs(np.median(np.diff(t)) - 60 / 90) < 0.002 and off < 2.5,
      f"host clock 90 BPM from beat 0: a step every {1000 * np.median(np.diff(t)):.1f} ms (666.7), {off:.2f} ms off the beats")
L, _ = e.render(1.2, clock=(True, 120.0, 16.25))  # the playhead jumps to beat 16.25
t = onsets(L)
check(len(t) >= 2 and t[0] < 0.01 and abs(t[1] - 0.375) < 0.004,
      f"playhead jump to beat 16.25 at 120: a step at once ({1000 * t[0]:.1f} ms), the next on beat 17 ({1000 * t[1]:.1f} ms, want 375)")
L, _ = e.render(2.0, clock=(False, 150.0, 3.0))  # stopped: continues at the host's tempo
t = onsets(L)
check(len(t) >= 3 and abs(np.median(np.diff(t)) - 0.4) < 0.002,
      f"transport stopped at 150: plays on, every {1000 * np.median(np.diff(t)):.1f} ms (400)")
e.set("sync", 1)  # internal: the host is ignored
e.set("tempo", 110)
L, _ = e.render(2.0, clock=(True, 90.0, 0.0))
t = onsets(L[int(0.1 * SR):])
check(len(t) >= 3 and abs(np.median(np.diff(t)) - 60 / 110) < 0.002,
      f"Sync Internal: the host is ignored, Tempo 110 (every {1000 * np.median(np.diff(t)):.1f} ms)")
e.close()

# Internal is the default; it keeps its own tempo and beat but shows the host's play / stop (the page's button, the pulse)
e = Engine()
e.solo_arp(0, "Loop", "1/4", octave=3, bpm=100, dec=DEC_30MS)
e.frames()
_, _, on = e.render(0.5, clock=(True, 90.0, 40.0), collect=True)
_, _, off = e.render(0.5, clock=(False, 90.0, 40.0), collect=True)
check(e.get("sync") == 1 and on[-1].playing == 1 and off[-1].playing == 0 and abs(on[-1].bpm - 100) < 1e-6 and on[-1].beat < 2.0,
      f"default Sync Internal: Tempo 100 against the host's 90 ({on[-1].bpm:.0f}), its own beat ({on[-1].beat:.2f}, not the host's 40), "
      f"playing {on[-1].playing} / {off[-1].playing} with the host's transport")
e.close()

# ---- telemetry follows the clock
e = Engine()
e.solo_arp(0, "Loop", "1/4", octave=3, bpm=120, dec=DEC_30MS)
e.set("sync", 0)
e.frames()
_, _, fr = e.render(1.0, clock=(True, 120.0, 8.0), collect=True)
check(len(fr) >= 93 and fr[0].hostClock == 1 and fr[0].playing == 1 and abs(fr[0].bpm - 120) < 1e-6
      and 8.0 <= fr[0].beat < 8.05 and 9.9 < fr[-1].beat <= 10.0,
      f"telemetry: {len(fr)} frames (one per block), host clock, playing, beat {fr[0].beat:.2f} -> {fr[-1].beat:.2f} (8 -> 10)")
e.close()
done()
