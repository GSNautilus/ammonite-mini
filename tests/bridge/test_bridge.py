"""The bridge (bridge/Bridge.hpp) headless, through its C API in the engine DLL: what the page is sent at
`ready`, `set` reaching the engine (the modulation routes too), the shape of a tick (the pool's LFOs and routes,
the CPU load), the transport, presets, patch files through the platform's picker (routes kept), recording. Run by
mini.ps1 test (AMMO_ENGINE_DLL names the DLL)."""
import base64
import ctypes as C
import json
import os
import struct
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "engine"))
from engine_api import (DLL, SRC_LFO1, Engine, check, done, info_id, lfo_id, pid,  # noqa: E402  (exits early if the DLL
                        route_id)                                                # is not built)

EVAL = C.CFUNCTYPE(None, C.c_void_p, C.c_char_p)
PICK = C.CFUNCTYPE(None, C.c_void_p, C.c_int, C.c_char_p)
RECORDED = C.CFUNCTYPE(None, C.c_void_p, C.c_char_p, C.c_int)
LOG = C.CFUNCTYPE(None, C.c_void_p, C.c_char_p)


class Host(C.Structure):
    _fields_ = [("user", C.c_void_p), ("eval", EVAL), ("pick", PICK), ("recorded", RECORDED), ("log", LOG)]


DLL.ammo_bridge_create.restype = C.c_void_p
DLL.ammo_bridge_create.argtypes = [C.c_void_p, C.POINTER(Host), C.c_char_p]
DLL.ammo_bridge_destroy.argtypes = [C.c_void_p]
DLL.ammo_bridge_message.argtypes = [C.c_void_p, C.c_char_p]
DLL.ammo_bridge_tick.argtypes = [C.c_void_p]
DLL.ammo_bridge_playing.argtypes = [C.c_void_p]
DLL.ammo_bridge_patch_text.argtypes = [C.c_void_p, C.c_char_p, C.c_int]
DLL.ammo_bridge_saved.argtypes = [C.c_void_p, C.c_char_p, C.c_int]
DLL.ammo_bridge_opened.argtypes = [C.c_void_p, C.c_char_p, C.c_char_p, C.c_int]
DLL.ammo_preset_count.restype = C.c_int
PF_HIDDEN = 4  # engine/Params.hpp: a reserved id, not saved
SAVED = [i for i in range(4096) if info_id(i) is not None and not info_id(i).flags & PF_HIDDEN]  # the host's and the routes
ROUTE_IDS = [i for i in SAVED if route_id(0, "src") <= i <= route_id(127, "pol")]


def js_args(js):
    """ammo.fn(a, b, ...) -> ("fn", [a, b, ...]): the bridge writes object keys bare, as JS allows; quote them
    (outside strings) and the arguments are JSON."""
    name, rest = js.split("(", 1)
    assert name.startswith("ammo.") and rest.endswith(")"), js[:80]
    body, out, i, n = rest[:-1], [], 0, len(rest) - 1
    while i < n:
        c = body[i]
        if c == '"':  # a string, as is
            j = i + 1
            while body[j] != '"':
                j += 2 if body[j] == "\\" else 1
            out.append(body[i:j + 1])
            i = j + 1
        elif (c.isalpha() or c == "_") and out and out[-1][-1:] in "{,":
            j = i
            while j < n and (body[j].isalnum() or body[j] == "_"):
                j += 1
            word = body[i:j]
            out.append('"%s"' % word if j < n and body[j] == ":" else word)
            i = j
        else:
            out.append(c)
            i += 1
    return name[5:], json.loads("[" + "".join(out) + "]")


class Rig:
    """An engine, a bridge on it, and everything the bridge asked of the platform."""

    def __init__(self, record_dir=""):
        self.e = Engine()
        self.e.set("sync", 1)  # the internal clock, as on the tablet
        self.calls, self.picks, self.recorded, self.logs = [], [], [], []
        self.cb = (EVAL(lambda u, js: self.calls.append(js_args(js.decode()))),
                   PICK(lambda u, save, name: self.picks.append((save, name.decode()))),
                   RECORDED(lambda u, path, ok: self.recorded.append((path.decode(), ok))),
                   LOG(lambda u, line: self.logs.append(line.decode())))
        self.host = Host(None, *self.cb)
        self.b = DLL.ammo_bridge_create(C.c_void_p(self.e.p), C.byref(self.host), record_dir.encode())

    def say(self, msg):
        self.calls.clear()
        DLL.ammo_bridge_message(self.b, msg.encode())
        return self.calls

    def tick(self):
        self.calls.clear()
        DLL.ammo_bridge_tick(self.b)
        return self.calls

    def last(self, fn):
        found = [a for f, a in self.calls if f == fn]
        return found[-1] if found else None

    def close(self):
        DLL.ammo_bridge_destroy(self.b)
        self.e.close()


# ---- ready: the table, every value, the presets, the info
r = Rig()
calls = r.say("ready")
check([f for f, _ in calls] == ["params", "values", "presets", "info"], "ready -> params, values, presets, info: %s" % [f for f, _ in calls])
table = calls[0][1][0]
check(len(ROUTE_IDS) == 512 and len(SAVED) == DLL.ammo_param_count() + 512,
      "the engine saves %d ids: its %d host parameters and 128 routes x 4" % (len(SAVED), DLL.ammo_param_count()))
check([d["id"] for d in table] == SAVED, "params: %d entries, every saved id in order (the routes too)" % len(table))
rd = next(d for d in table if d["id"] == route_id(0, "target"))
check(rd["slot"] == -1 and rd["min"] == -1 and rd["def"] == -1, "a route's target: slot -1, -1 (none) by default")
by_s = {(d["s"], d["slot"]): d for d in table}
gen1 = by_s.get(("gen", 0))
check(gen1 is not None and gen1["id"] == pid("gen", 0) and gen1["names"][:2] == ["Off", "Arp"] and gen1["steps"] == 5,
      "params: slot 1's gen is id %s, 5 steps, names Off, Arp, ..." % (gen1 and gen1["id"]))
check(all(d["steps"] > 0 and len(d["names"]) == d["steps"] for d in table if "names" in d), "params: names only on stepped parameters, one per step")
values = dict((int(i), v) for i, v in calls[1][1][0])
check(len(values) == len(table) and all(abs(values[d["id"]] - r.e.get_id(d["id"])) < 1e-5 * max(1, abs(values[d["id"]])) for d in table),
      "values: one per parameter, the engine's")
plist, cur, fname = calls[2][1]
check(len(plist) == DLL.ammo_preset_count() and cur == 1 and fname == "" and plist[1]["n"] == "First light",
      "presets: %d, current 1 (First light), no file" % len(plist))
check(calls[3][1][0].get("fmt") == "android", "info: fmt android")

# ---- set: into the engine, clamped; unknown ids and junk ignored
tempo = pid("tempo")
r.say("set %d 97.5" % tempo)
check(abs(r.e.get("tempo") - 97.5) < 1e-4, "set tempo 97.5 -> the engine has %.2f" % r.e.get("tempo"))
r.say("set %d 9999" % tempo)
check(abs(r.e.get("tempo") - 240) < 1e-4, "set tempo 9999 -> clamped to %.0f" % r.e.get("tempo"))
before = r.e.get("tempo")
r.say("set 99999 1")
r.say("set nonsense")
r.say("edit %d 1" % tempo)
check(r.e.get("tempo") == before and not r.calls, "an unknown id, junk and edit change nothing and say nothing")
r.say("set %d 2.6" % pid("gen", 3))
check(r.e.get("gen", 3) == 3, "set a stepped parameter 2.6 -> %g" % r.e.get("gen", 3))
r.say("set %d 110" % tempo)
r.say("set %d 0" % pid("gen", 3))

# ---- routes: not desktop's host parameters, set straight into the engine like the rest
cutoff = pid("cutoff", 0)
for k, v in (("src", SRC_LFO1 + 20), ("target", cutoff), ("amt", 0.4), ("pol", 0)):
    r.say("set %d %g" % (route_id(99, k), v))
check([r.e.get_id(route_id(99, k)) for k in ("src", "target", "amt", "pol")] == [SRC_LFO1 + 20, cutoff, C.c_float(0.4).value, 0],
      "set route 100: LFO 21 on channel 1's Cutoff, 40 %, unipolar, in the engine")
r.say("set %d 3" % route_id(99, "amt"))
check(r.e.get_id(route_id(99, "amt")) == 1, "a route's amount clamped to 1")
r.say("set %d 0.4" % route_id(99, "amt"))
r.say("set %d 1" % lfo_id(20, "on"))

# ---- a tick: the frames since the last, desktop's shape
r.e.render(0.5)
calls = r.tick()
check(len(calls) == 1 and calls[0][0] == "tick", "a tick after 0.5 s: one ammo.tick")
frames, hostinfo = calls[0][1]
check(1 <= len(frames) <= 6, "it carries %d frames (at most 6)" % len(frames))
f = frames[-1]
keys = ["s", "b", "t", "p", "h", "cr", "cd", "cq", "pp", "pl", "km", "cm", "sr", "bl", "mr", "mp", "gg", "lg", "lf", "rt", "cpu", "cpk", "ch"]
check(list(f.keys()) == keys, "a frame's fields: %s" % ",".join(f.keys()))
check("20" in f["lf"] and -1 <= f["lf"]["20"] <= 1,
      "lf: the LFOs that ran, by index, LFO 21 among them: %s" % f["lf"])
check("99" in f["rt"] and all(0 <= v <= 1 for v in f["rt"].values()), "rt: the live routes' positions, route 100 among them: %s" % f["rt"])
check(all(0 < g["cpu"] <= g["cpk"] < 1 for g in frames), "cpu: the engine's load, cpk its worst block (%s)" % ["%.4f/%.4f" % (g["cpu"], g["cpk"]) for g in frames])
check(f["p"] == 1 and f["h"] == 0 and f["sr"] == 48000, "playing (the bridge's transport), no host clock, 48000 Hz")
check(set(f["ch"].keys()) == {"0", "1", "2"}, "First light: channels 0, 1, 2 in it (%s)" % ",".join(sorted(f["ch"])))
c = f["ch"]["0"]
ckeys = ["a", "n", "pc", "e", "r", "k", "h", "sd", "st", "ln", "v", "ws", "w"]
check([k for k in c.keys() if k not in ("m", "dk")] == ckeys, "a channel's fields: %s" % ",".join(c.keys()))
wave = base64.b64decode(c["w"])
check(len(wave) == 128 and max(abs(struct.unpack("b", bytes([x]))[0]) for x in wave) in (126, 127), "its wave: 128 signed bytes, normalised to 127")
check(set(hostinfo.keys()) == {"idleMs", "evalMs"}, "and the host's numbers: idleMs, evalMs")
while r.tick():  # the rest of the half second (the first tick took six)
    pass
check(r.tick() == [], "no new frames: no tick")
r.e.render(2.0)
check(len(r.tick()[0][1][0]) == 6, "many frames waiting: 6 in one tick")

# ---- small blocks (the tablet's 96-frame bursts): 20 of them fold into 6 frames, hits and timing kept, waves last
sb = Rig()  # a fresh engine with a bridge, and its twin read frame by frame: the same from the first sample
sb.say("ready")
twin = Engine()
twin.set("sync", 1)
for e in (sb.e, twin):
    DLL.ammo_apply_preset(C.c_void_p(e.p), 3)  # Clockwork: three patterns of sixteenths, hits everywhere
    e.render(0.5, block=96)
while sb.tick():
    pass
twin.frames()
sb.e.render(20 * 96 / 48000, block=96)
_, _, ref_frames = twin.render(20 * 96 / 48000, block=96, collect=True)
sent = sb.tick()[0][1][0]
check(len(ref_frames) == 20 and len(sent) == 6, "20 blocks of 96 -> a tick of %d frames (%d published)" % (len(sent), len(ref_frames)))
check(sum(f["bl"] for f in sent) == 20 * 96, "their block counts cover all 20 blocks: %s" % [f["bl"] for f in sent])
hits_ref = sum(1 for f in ref_frames for s in range(16) if f.ch[s].hit)
groups, at = [], 0
for j in range(6):
    to = (j + 1) * 20 // 6
    groups.append(ref_frames[at:to])
    at = to
want = sum(1 for g in groups for s in range(16) if any(f.ch[s].hit for f in g))
got = sum(1 for f in sent for c in f["ch"].values() if c["h"])
check(hits_ref > 0 and got == want, "hits: %d in the 20 blocks, %d frames x channels with one, %d sent" % (hits_ref, want, got))
check(all("w" not in c for f in sent[:-1] for c in f["ch"].values()) and all("w" in c for c in sent[-1]["ch"].values()),
      "waves in the last frame only")
check(all(0 < f["cpu"] <= f["cpk"] + 1e-4 for f in sent), "a folded frame's cpu (its blocks' mean) is at most its cpk (their worst)")
for e in (sb.e, twin):  # Slow tide: three LFOs on the pads
    DLL.ammo_apply_preset(C.c_void_p(e.p), 2)
    e.render(0.5, block=96)
while sb.tick():
    pass
twin.frames()
sb.e.render(20 * 96 / 48000, block=96)
_, _, ref_frames = twin.render(20 * 96 / 48000, block=96, collect=True)
sent = sb.tick()[0][1][0]
lasts = [ref_frames[(j + 1) * 20 // 6 - 1] for j in range(6)]
want_lf = [{str(l): round(f.lfo[l], 3) for l in range(32) if f.lfoRun >> l & 1} for f in lasts]
want_rt = [{str(q): round(f.route[q], 4) for q in range(128) if f.route[q] >= 0} for f in lasts]
check(len(want_lf[-1]) == 3 and len(want_rt[-1]) > 0 and [f["lf"] for f in sent] == want_lf and [f["rt"] for f in sent] == want_rt,
      "Slow tide folded: each frame's lf and rt are its last block's (%d LFOs, %d routes)" % (len(want_lf[-1]), len(want_rt[-1])))
twin.close()
sb.close()

# ---- the transport: Space down toggles; its repeats and its release do not
check(DLL.ammo_bridge_playing(r.b) == 1, "playing at the start")
while r.tick():
    pass
r.say("key 1 32 0")
check(DLL.ammo_bridge_playing(r.b) == 0, "Space: stopped")
told = r.tick()
check(len(told) == 1 and told[0][1][0][-1]["p"] == 0 and told[0][1][0][-1]["bl"] == 0,
      "with no new frame, the next tick still tells the page (the last frame again, p:0)")
check(r.tick() == [], "and only once")
r.say("key 1 32 1")
r.say("key 0 32 0")
r.say("key 1 65 0")
check(DLL.ammo_bridge_playing(r.b) == 0, "a repeat, the release and another key change nothing")
r.e.render(0.1)
check(r.tick()[0][1][0][-1]["p"] == 0, "a tick says p:0")
r.say("key 1 32 0")
check(DLL.ammo_bridge_playing(r.b) == 1, "Space again: playing")

# ---- presets: every value into the engine and the page
calls = r.say("preset 7")
check([fn for fn, _ in calls] == ["values", "presets"], "preset 7 -> values, presets")
ref = Engine()
DLL.ammo_apply_preset(C.c_void_p(ref.p), 7)
ids = [d["id"] for d in table]
check(all(abs(r.e.get_id(i) - ref.get_id(i)) < 1e-5 for i in ids), "the engine now has preset 7's values, the routes too (as ammo_apply_preset)")
check(r.e.get_id(route_id(99, "src")) == 0 and any(ref.get_id(route_id(q, "src")) for q in range(128)),
      "route 100 set earlier is gone; the preset's own routes are in")
sent = dict((int(i), v) for i, v in calls[0][1][0])
check(all(abs(sent[i] - ref.get_id(i)) < 1e-5 * max(1, abs(sent[i])) for i in ids), "and the page was sent them")
check(calls[1][1][1] == 7 and calls[1][1][2] == "", "presets: current 7")
ref.close()
check(r.say("preset 999") == [] and r.say("preset -1") == [], "a preset out of range: nothing")

# ---- save: the platform's picker, the text, the name
calls = r.say('save {"v":1,"looks":{"0":"glow"}}')
check(r.picks[-1] == (1, "Night groove.ammo") and not calls, "save -> a Save picker suggesting 'Night groove.ammo'")
n = DLL.ammo_bridge_patch_text(r.b, None, 0)
buf = C.create_string_buffer(n + 1)
DLL.ammo_bridge_patch_text(r.b, buf, n + 1)
text = buf.value.decode()
check(len(text) == n and text.rstrip("\n").splitlines()[-1] == 'page {"v":1,"looks":{"0":"glow"}}', "the patch text ends with the page line")
r.calls.clear()
DLL.ammo_bridge_saved(r.b, b"Groove mine.ammo", 1)
check(r.last("presets")[1:] == [7, "Groove mine"] and r.last("toast") == ["Saved Groove mine.ammo"], "saved -> presets name the file, a toast")
r.calls.clear()
DLL.ammo_bridge_saved(r.b, b"", 0)
check(r.calls == [], "a cancelled picker: nothing")
DLL.ammo_bridge_saved(r.b, b"x.ammo", 0)
check(r.last("toast") == ["Could not write x.ammo"], "a failed write: a toast")

# ---- open: the values, the page line, the name
r.say("preset 1")
calls = r.say("open")
check(r.picks[-1] == (0, ""), "open -> an Open picker")
r.calls.clear()
DLL.ammo_bridge_opened(r.b, b"Groove mine.ammo", text.encode(), len(text.encode()))
fns = [fn for fn, _ in r.calls]
check(fns == ["values", "page", "presets", "toast"], "opened -> values, page, presets, toast: %s" % fns)
check(r.last("page") == ['{"v":1,"looks":{"0":"glow"}}'], "ammo.page gets the page line as it was saved")
check(r.last("presets")[1:] == [-1, "Groove mine"], "presets: -1 (a file), its name")
ref = Engine()
DLL.ammo_apply_preset(C.c_void_p(ref.p), 7)
check(all(abs(r.e.get_id(i) - ref.get_id(i)) < 1e-4 for i in ids), "the engine is back at the saved patch (preset 7's values)")
ref.close()

# ---- a route made on the page goes out with the patch text and comes back with it
r.say("preset 1")
r.say("set %d %d" % (route_id(127, "src"), SRC_LFO1 + 31))
r.say("set %d %d" % (route_id(127, "target"), pid("volume")))
r.say("set %d -0.25" % route_id(127, "amt"))
r.say("save {}")
n = DLL.ammo_bridge_patch_text(r.b, None, 0)
buf = C.create_string_buffer(n + 1)
DLL.ammo_bridge_patch_text(r.b, buf, n + 1)
text2 = buf.value.decode()
check(text2.startswith("ammonite-desktop 3\n") and "%d -0.25" % route_id(127, "amt") in text2,
      "the patch text (version 3) has route 128's amount")
r.say("preset 1")
check(r.e.get_id(route_id(127, "src")) == 0, "a preset clears it")
DLL.ammo_bridge_opened(r.b, b"routed.ammo", text2.encode(), len(text2.encode()))
check([r.e.get_id(route_id(127, k)) for k in ("src", "target", "amt")] == [SRC_LFO1 + 31, pid("volume"), -0.25],
      "opening the file brings route 128 back: LFO 32 on the volume, -25 %")
sent = dict((int(i), v) for i, v in r.last("values")[0])
check(sent[route_id(127, "target")] == pid("volume"), "and the page is sent it")

# ---- desktop-only messages: the output device (its standalone host's), the stage's GL status
logs = len(r.logs)
check(r.say("outputs") == [] and r.say("output 3") == [] and r.say("output") == [] and len(r.logs) == logs,
      "outputs / output: no output devices here, ignored quietly")
r.say("gl ok webgl2")
check(r.logs[-1] == "gl ok webgl2", "gl ...: logged as it came")
r.calls.clear()
DLL.ammo_bridge_opened(r.b, b"notes.txt", b"hello", 5)
check(r.last("toast") == ["Not an Ammonite patch: notes.txt"] and r.last("values") is None, "a file that is not a patch: a toast, nothing applied")

# ---- recording: into the platform's folder, drained by ticks, the platform told
with tempfile.TemporaryDirectory() as tmp:
    rr = Rig(tmp)
    rr.say("ready")
    calls = rr.say("record 1")
    check(rr.last("rec") == [{"on": 1}], "record 1 -> ammo.rec({on:1})")
    for _ in range(10):
        rr.e.render(0.1)
        rr.tick()
    calls = rr.say("record 0")
    rec = rr.last("rec")[0]
    path = rec.get("path", "")
    check(rec["on"] == 0 and rec["ok"] == 1 and abs(rec["secs"] - 1.0) < 0.05 and rec["dropped"] == 0,
          "record 0 -> on 0, ok, %.2f s, %d dropped" % (rec["secs"], rec["dropped"]))
    check(os.path.dirname(path) == tmp and os.path.basename(path).startswith("Ammonite ") and path.endswith(" First light.wav"),
          "named 'Ammonite <date> <time> First light.wav' in the folder given: %s" % os.path.basename(path))
    check(rr.recorded == [(path, 1)], "the platform is told of it")
    size = os.path.getsize(path) if os.path.exists(path) else 0
    check(abs(size - (44 + 8 * 48000)) < 8 * 48000 * 0.05 + 100, "the WAV: %d bytes, about a second of 32-bit stereo" % size)
    rr.close()
    bad = Rig(os.path.join(tmp, "missing", "folder"))
    bad.say("ready")
    bad.say("record 1")
    check(bad.last("rec") == [{"on": 0}] and (bad.last("toast") or [""])[0].startswith("Could not record to "),
          "a folder that cannot be written: rec off, a toast")
    bad.close()

r.close()
done()
