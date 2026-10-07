"""The parameter table through the C API: count, unique and stable ids (a
golden list), groups, ranges, defaults, hidden ids, set / get, step names,
the default patch, save / load."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from engine_api import *  # noqa: E402,F403

print(f"== {DLL_PATH} ({DLL.ammo_version().decode()})")

ids = [p.id for p in INFOS]
check(len(ids) == len(set(ids)), f"{len(ids)} parameters, ids unique")
check(len(GLOBAL) == 23 and GLOBAL["tempo"] == 0 and GLOBAL["volume"] == 10 and GLOBAL["macro4"] == 14,
      f"23 global parameters at ids 0..22: {sorted(GLOBAL.items(), key=lambda kv: kv[1])[:4]} ...")
check(len(SLOT_PARAMS) == 65 and pid("gen", 0) == 64 and pid("gen", 1) == 192 and pid("glide", 15) == 64 + 128 * 15 + 34,
      "65 parameters per slot; slot blocks of 128 from id 64 (slot 1 gen = 64, slot 2 gen = 192)")

# the golden ids: these never move
GOLDEN = {"tempo": 0, "sync": 1, "swing": 2, "root": 3, "scale": 4, "prog": 5, "change": 6, "chord": 7, "restart": 8,
          "octave": 9, "volume": 10, "macro1": 11,
          # phase 4, package B: the shared reverb
          "rev_size": 15, "rev_decay": 16, "rev_damp": 17, "rev_pre": 18, "rev_width": 19, "rev_return": 20,
          # phase 4, package B: the master bus
          "glue": 21, "ceiling": 22}
GOLDEN_SLOT = {"gen": 0, "inst": 1, "level": 2, "pan": 3, "mute": 4, "show": 5, "degree": 6, "oct": 7, "arp_mode": 8,
               "arp_pool": 9, "arp_range": 10, "arp_div": 11, "arp_len": 12, "arp_gate": 13, "arp_density": 14,
               "arp_vary": 15, "arp_ratchet": 16, "shape": 17, "detune": 18, "sub": 19, "noise": 20, "cutoff": 21,
               "reso": 22, "filter_type": 23, "drive": 24, "amp_a": 25, "amp_d": 26, "amp_s": 27, "amp_r": 28,
               "filt_amt": 29, "filt_a": 30, "filt_d": 31, "pitch_amt": 32, "pitch_d": 33, "glide": 34,
               # phase 4: chord and bass
               "chord_notes": 35, "chord_voicing": 36, "chord_lead": 37, "chord_rhythm": 38, "chord_strum": 39,
               "bass_pattern": 40,
               # phase 4: rhythm and drum
               "rhy_rotate": 41, "rhy_chance": 42, "rhy_pitch": 43, "drum_model": 44, "drum_tune": 45, "drum_decay": 46,
               "drum_tone": 47, "drum_snap": 48,
               # phase 4, package B: the inserts
               "fx_drive": 49, "fx_tone": 50, "cho_on": 51, "cho_rate": 52, "cho_depth": 53, "cho_mix": 54, "dly_div": 55,
               "dly_fb": 56, "dly_pp": 57, "dly_damp": 58, "dly_mix": 59,
               # phase 4, package B: the sends
               "rev_send": 60, "duck_src": 61, "duck_amt": 62,
               # phase 4: chorus modes, the chord arp
               "cho_mode": 63, "chord_ring": 64}
check(all(GLOBAL[k] == v for k, v in GOLDEN.items()), "global ids match the golden list")
check(all(SLOT_PARAMS[k] == v for k, v in GOLDEN_SLOT.items()), "slot offsets match the golden list")

names = {p.symbol.decode(): p for p in INFOS}
t = names["tempo"]
check(t.min == 20 and t.max == 240 and t.default == 110 and t.steps == 0 and t.group == b"global",
      f"Tempo: {t.min:.0f}..{t.max:.0f} default {t.default:.0f}, continuous, global")
m = names["s3_arp_mode"]
check(m.name == b"3 Arp mode" and m.steps == 6 and m.group == b"slot 3" and m.flags & 2,
      f"slot 3 Arp mode: '{m.name.decode()}', 6 steps, group '{m.group.decode()}'")
check(step_name(pid("arp_mode", 2), 4) == "Up-down" and step_name(pid("scale"), 6) == "Harmonic minor"
      and step_name(pid("oct", 0), -1) == "-1" and step_name(pid("root"), 9) == "A" and step_name(pid("tempo"), 0) is None,
      "step names: Up-down, Harmonic minor, -1 (plain integer), A; none for a continuous one")
show = names["s1_show"]
check(not (show.flags & 1) and (show.flags & 8), "Show (the eye) is not automatable and boolean")

e = Engine()
check(abs(e.get("tempo") - 110) < 1e-6 and e.get("root") == 9 and e.get("scale") == 1,
      f"defaults: tempo {e.get('tempo'):.0f}, root A ({e.get('root'):.0f}), Minor ({e.get('scale'):.0f})")
check(e.get("gen", 0) == 1 and e.get("gen", 1) == 1 and e.get("gen", 2) == 1 and e.get("gen", 3) == 0
      and e.get("arp_mode", 0) == 2 and e.get("arp_pool", 0) == 3 and e.get("arp_mode", 2) == 5 and abs(e.get("arp_density", 2) - 0.6) < 1e-6,
      "the default patch: slots 1-3 on (Up Fifths, Up-down Triad, Random Key density 0.6), slot 4 off")

e.set("tempo", 999)
e.set("arp_mode", 3.4, 5)
e.set("pan", -7, 5)
check(e.get("tempo") == 240 and e.get("arp_mode", 5) == 3 and e.get("pan", 5) == -1,
      "set clamps to the range and rounds stepped values (tempo 999 -> 240, mode 3.4 -> 3, pan -7 -> -1)")
hidden = GLOBAL_IDS + 100  # a reserved id in slot 1's block
e.set_id(hidden, 0.7)
check(e.get_id(hidden) == 0.0, "a reserved (hidden) id ignores writes")
e.set_id(99999, 1.0)
check(e.get_id(99999) == 0.0 and e.get_id(-1) == 0.0, "ids out of range are ignored")

# save / load
e.set("tempo", 123)
e.set("cutoff", 0.33, 7)
e.set("gen", 1, 7)
blob = e.save()
lines = blob.splitlines()
check(lines[0] == "ammonite-desktop 2" and f"{pid('tempo')} 123" in blob and f"{pid('cutoff', 7)} 0.33" in blob
      and f"{pid('gen', 7)} 1" in blob and not any(ln.startswith(f"{pid('gen', 3)} ") for ln in lines),
      f"save: a versioned text, {len(lines) - 1} non-default values")
f = Engine()
f.set("tempo", 77)
f.set("gen", 1, 9)
ok = f.load(blob)
check(ok and f.get("tempo") == 123 and abs(f.get("cutoff", 7) - 0.33) < 1e-6 and f.get("gen", 7) == 1 and f.get("gen", 9) == 0
      and f.get("arp_mode", 0) == 2 and f.get("arp_density", 2) == e.get("arp_density", 2),
      "load: restores the saved values, resets the rest, keeps the default patch")
check(not f.load("nonsense") and f.get("tempo") == 123, "a bad chunk is refused and changes nothing")
# a version 1 file (before 4/1, 2/1 and the dotted divisions): its divisions keep their note values
v1 = f"ammonite-desktop 1\n{pid('arp_div', 0)} 0\n{pid('arp_div', 1)} 3\n{pid('arp_div', 2)} 8\n"
ok = f.load(v1)
got = [DIVS[int(f.get("arp_div", s))] for s in range(4)]
check(ok and got == ["1/1", "1/4T", "1/32", "1/4"], f"a version 1 file's divisions: 1/1 1/4T 1/32 and the default 1/4 -> {got}")
e.close()
f.close()
done()
