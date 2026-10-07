/* Ammonite Mini: the page. Binds the engine's parameter table and telemetry
   (pushed by the host: AmmoniteUI.cpp on desktop, the bridge on Android) to
   one panel of glass filling the screen. Ammonite Desktop's panel without its
   stage, made for a tablet's touch.

   The panel has two tabs: Conductor (key, chords, time, macros, space,
   master) and Channels (an accordion: every channel a row with its wave,
   level, pan and mute; one opens at a time to show what it contains,
   Generator, Instrument and Effects, one section at a time). The clock is
   always the internal one: there is no host to sync to, so no Sync.

   The layout is designed LAYOUT_H (900) high and scaled to the window's
   height (or its width, below MIN_W wide); its width follows the window. On
   the tablet (1333x800 CSS px) that is 0.89.

   Touch: knobs drag up and down, faders sideways; a second finger held
   anywhere makes a drag fine (as Shift does); a double-tap resets. See the
   events.

   The DOM is built on structural changes only (tab, selection, slots on /
   off, sections, presets); values, chip states and texts refresh in place,
   so menus stay open and scroll positions survive. Canvases repaint every
   frame.

   Host -> page: ammo.params(defs) ammo.values(pairs) ammo.param(id, v)
                 ammo.presets(list, current, file) ammo.page(json) ammo.rec(o) ammo.toast(text)
                 ammo.info(o) ammo.tick(frames, host)
   Page -> host: ready | set <id> <v> | edit <id> <0|1> | preset <k> | save <json> | open | record <0|1> |
                 key <down> <vk> <repeat> | log ...
   A patch file carries the page's own state with the engine's (pageState(), ammo.page: desktop's stage settings,
   kept as they came). Ctrl+S, Ctrl+O and R
   are the page's keys (save, open, record); every other key goes to the host.
   The host: the Android app's bridge (window.ammoHost, a WebMessageListener; bridge/Bridge.hpp), or desktop's
   WebView2 (window.chrome.webview). In a plain browser, dev.html loads fake-engine.js to stand in for it. */
(function () {
  'use strict';
  /* the layout: 900 high (0.89 on the tablet's 1333x800), as wide as the window; below 1500 wide, scaled to the width */
  var LAYOUT_H = 900, MIN_W = 1500;
  var bridge = (window.chrome && window.chrome.webview) || window.ammoHost; // desktop's WebView2, or the Android app's
  function send(m) { if (bridge) bridge.postMessage(m); }

  /* ------------------------------------------------------------- data */
  var DEFS = {}, ORDER = {}, SLOTP = {}, P = {}, PRESETS = [], presetNow = 1, patchFile = '', INFO = {};
  var rec = { on: false, t0: 0 };
  var SLOTS = 16, SLOT_BASE = 64, SLOT_STRIDE = 128;
  var PROGS = [[], [0, 4, 5, 3], [0, 5, 3, 4], [5, 3, 0, 4], [0, 5, 2, 6], [1, 4, 0, 0], [0, 3], [0, 4, 5, 2, 3, 0, 3, 4], [0, 6, 5, 4]];
  var ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  var SCALE_IV = [[0, 2, 4, 5, 7, 9, 11], [0, 2, 3, 5, 7, 8, 10], [0, 2, 3, 5, 7, 9, 10], [0, 1, 3, 5, 7, 8, 10], [0, 2, 4, 6, 7, 9, 11],
                  [0, 2, 4, 5, 7, 9, 10], [0, 2, 3, 5, 7, 8, 11], [0, 2, 4, 7, 9], [0, 3, 5, 7, 10], [0, 3, 5, 6, 7, 10]];
  var QUAL = ['', 'm', 'dim', 'aug', 'sus'];
  function gid(sym) { return DEFS[sym] ? DEFS[sym].id : -1; }
  function sid(slot, sym) { return SLOT_BASE + SLOT_STRIDE * slot + (SLOTP[sym] != null ? SLOTP[sym] : 0); }
  function val(id) { return P[id] != null ? P[id] : (ORDER[id] ? ORDER[id].def : 0); }
  function sval(slot, sym) { return val(sid(slot, sym)); }
  function gval(sym) { return val(gid(sym)); }
  function names(id) { return ORDER[id] ? ORDER[id].names || [] : []; }
  function nameOf(id) { var d = ORDER[id]; return d && d.names ? d.names[Math.round(val(id)) - d.min] || '' : ''; }

  /* knob kinds and formats per parameter symbol */
  var KINDS = {
    level: ['level', 'pct'], pan: ['pan', 'bip'], degree: ['range', 'deg'], oct: ['range', 'octs'],
    arp_range: ['range', 'range'], arp_div: ['div', 'div'], arp_len: ['len', 'steps'], arp_gate: ['level', 'pct'],
    arp_density: ['density', 'pct'], arp_vary: ['chance', 'pct'], arp_ratchet: ['chance', 'pct'],
    shape: ['wave', 'pct'], detune: ['detune', 'cents'], sub: ['level', 'pct'], noise: ['density', 'pct'],
    cutoff: ['filter', 'hz'], reso: ['reso', 'pct'], filter_type: ['type', 'type'], drive: ['drive', 'pct'],
    amp_a: ['attack', 'att'], amp_d: ['env', 'dec'], amp_s: ['level', 'pct'], amp_r: ['env', 'dec'],
    filt_amt: ['bipenv', 'oct4'], filt_a: ['attack', 'att'], filt_d: ['env', 'dec'],
    pitch_amt: ['bipenv', 'semi'], pitch_d: ['env', 'pdec'], glide: ['lfo', 'glide'],
    tempo: ['tempo', 'bpm'], swing: ['swing', 'pct'], root: ['note', 'note'], octave: ['range', 'octs'], volume: ['level', 'pct'],
    macro1: ['tail', 'pct'], macro2: ['lfo', 'pct'], macro3: ['tail', 'pct'], macro4: ['drive', 'pct'],
    rhy_rotate: ['range', 'int'], rhy_chance: ['chance', 'pct'],
    fx_drive: ['drive', 'pct'], fx_tone: ['bipenv', 'bip'], cho_rate: ['lfo', 'chz'], cho_depth: ['detune', 'pct'], cho_mix: ['level', 'pct'],
    dly_fb: ['env', 'pct'], dly_damp: ['level', 'dhz'], dly_mix: ['level', 'pct'], rev_send: ['level', 'pct'], duck_amt: ['env', 'pct'],
    rev_size: ['len', 'pct'], rev_decay: ['env', 'sec'], rev_damp: ['level', 'rhz'], rev_pre: ['attack', 'ms'], rev_width: ['density', 'pct'], rev_return: ['level', 'pct'], glue: ['drive', 'pct'], ceiling: ['level', 'db'],
    drum_tune: ['detune', 'sint'], drum_decay: ['env', 'pct'], drum_tone: ['filter', 'pct'], drum_snap: ['attack', 'pct']
  };
  function specOf(id) {
    var d = ORDER[id]; if (!d) return null;
    var kk = KINDS[d.s] || ['level', 'pct'];
    if (d.s === 'cho_rate' && vibrato(d.slot)) kk = ['lfo', 'vhz']; // Vibrato's rate keeps the wide curve
    return { id: id, kind: kk[0], fmt: kk[1], min: d.min, max: d.max, steps: d.steps, def: d.def, label: d.n };
  }

  /* ---------------------------------------------------------- telemetry */
  var F = { seq: 0, beat: 0, bpm: 0, playing: 0, host: 0, cr: 9, cd: 0, cq: 1, pp: -1, pl: 0, km: 0, cm: 0, sr: 0, bl: 0, mr: 0, mp: 0, gg: 0, lg: 0, idleMs: 0, evalMs: 0 };
  var MH = { rms: new Float32Array(240), peak: new Float32Array(240), pos: 0 }; // the master meter's last four seconds
  var Q = [], LAT = 20, lastBurstAt = 0, burstGap = 10;
  var stats = { ticks: 0, frames: 0, tickT: [], tickMs: 0 };
  var CH = {};
  for (var s0 = 0; s0 < SLOTS; s0++) CH[s0] = { hue: null, sat: 92, amp: 0, note: 57, pc: 9, bytes: new Uint8Array(128), wave: new Float32Array(128), active: 0, muted: 0, hit: 0, hitSeed: 0, step: 0, len: 0, rms: 0, peak: 0, glow: 0,
                                                 notes: [], vnotes: [], dkAcc: 0, dkHist: new Float32Array(240), dkPos: 0 };

  window.ammo = {
    params: function (list) {
      DEFS = {}; ORDER = {}; SLOTP = {};
      for (var i = 0; i < list.length; i++) {
        var d = list[i]; ORDER[d.id] = d;
        if (d.slot < 0) DEFS[d.s] = d; else if (d.slot === 0) SLOTP[d.s] = d.id - SLOT_BASE;
      }
      for (var k in ORDER) if (P[k] == null) P[k] = ORDER[k].def;
      structure = true;
    },
    values: function (pairs) { for (var i = 0; i < pairs.length; i++) P[pairs[i][0]] = pairs[i][1]; structure = true; },
    param: function (id, v) {
      P[id] = v; var d = ORDER[id];
      if (d && STRUCT[d.s]) structure = true; else dirty = true;
    },
    presets: function (list, cur, file) { PRESETS = list; presetNow = cur; patchFile = file || ''; dirty = true; },
    /* a patch file's page state (a JSON string): on desktop the stage's looks, visual settings and camera. Mini
       has no stage: it keeps the object as it came and writes it back on a save, so a patch makes the round trip
       desktop -> tablet -> desktop with its looks. */
    page: function (json) {
      var o; try { o = typeof json === 'string' ? JSON.parse(json) : json; } catch (e) { return; }
      if (!o || typeof o !== 'object') return;
      ui.page = o;
      saveUi();
    },
    rec: function (o) {
      var was = rec.on;
      rec.on = !!o.on;
      if (rec.on) rec.t0 = performance.now() - (o.secs || 0) * 1000;
      else if (was && o.path) toast((o.ok === 0 ? 'Recording failed: ' : 'Recorded ' + fmtTime(o.secs || 0) + ' to ') + o.path + (o.dropped ? ' (' + o.dropped + ' frames lost)' : ''));
      dirty = true;
    },
    toast: function (text) { toast(text); },
    info: function (o) { INFO = o; },
    tick: function (list, host) {
      var a = performance.now(), n = list.length, i;
      if (host) { F.idleMs = host.idleMs; F.evalMs = host.evalMs; }
      if (lastBurstAt) burstGap = burstGap * 0.9 + Math.min(50, a - lastBurstAt) * 0.1;
      lastBurstAt = a;
      LAT = Math.max(8, Math.min(60, burstGap * 1.5));
      for (i = 0; i < n; i++) {
        var f = list[i], blockMs = f.sr > 0 ? 1000 * f.bl / f.sr : 2.7;
        Q.push({ t: a - (n - 1 - i) * blockMs, f: f });
        // every note into its channel's history as it arrives (sampling one frame per paint would miss most),
        // stamped for when the page shows that frame
        for (var hd in f.ch) if (f.ch[hd].dk) CH[hd].dkAcc = Math.max(CH[hd].dkAcc, f.ch[hd].dk); // the duck's deepest since the last paint
        for (var hs in f.ch) if (f.ch[hs].h) { var hn = CH[hs].notes; hn.push({ n: f.ch[hs].n, t: (a - (n - 1 - i) * blockMs + LAT) / 1000 }); if (hn.length > 48) hn.shift(); }
      }
      while (Q.length > 64) Q.shift();
      stats.ticks++; stats.frames += n; stats.tickT.push(a); if (stats.tickT.length > 2400) stats.tickT.shift();
      stats.tickMs = stats.tickMs * 0.9 + (performance.now() - a) * 0.1;
    }
  };

  function sampleTelemetry(now, dt) {
    if (!Q.length) return;
    var td = now - LAT;
    while (Q.length > 1 && Q[1].t <= td) Q.shift();
    var f = Q[0].f;
    if (f.s !== F.seq) {
      F.seq = f.s; F.beat = f.b; F.bpm = f.t; F.playing = f.p; F.host = f.h; F.cr = f.cr; F.cd = f.cd; F.cq = f.cq; F.pp = f.pp; F.pl = f.pl;
      F.km = f.km; F.cm = f.cm; F.sr = f.sr; F.bl = f.bl; F.mr = f.mr; F.mp = f.mp; F.gg = f.gg || 0; F.lg = f.lg || 0;
      for (var s = 0; s < SLOTS; s++) {
        var c = CH[s], fc = f.ch[s];
        c.hit = 0;
        if (!fc) { c.active = 0; c.muted = 0; c.amp *= 0.9; continue; }
        c.active = fc.a; c.muted = fc.m ? 1 : 0; c.note = fc.n; c.pc = fc.pc; c.amp = fc.e; c.rms = fc.r; c.peak = fc.k; c.hit = fc.h; c.hitSeed = fc.sd; c.step = fc.st; c.len = fc.ln; c.vnotes = fc.v || [];
        if (fc.w && fc.w.length) {
          var bin = atob(fc.w), m = Math.min(bin.length, 128);
          for (var i = 0; i < m; i++) { var b = bin.charCodeAt(i), sgn = b >= 128 ? b - 256 : b; c.wave[i] = sgn / 127; c.bytes[i] = (b + 128) & 255; }
        }
      }
    }
    for (var s2 = 0; s2 < SLOTS; s2++) {
      var c2 = CH[s2], target = drumHue(s2);
      if (target == null) target = Knobs.hueOf(c2.pc);
      if (c2.hue == null) c2.hue = target;
      else { var dd = ((target - c2.hue + 540) % 360) - 180; c2.hue = (c2.hue + dd * (1 - Math.exp(-dt / 0.12)) + 360) % 360; }
      c2.glow = c2.hit ? 1 : c2.glow * Math.exp(-dt / 0.35);
      if (s2 === 0) { MH.rms[MH.pos] = F.mr; MH.peak[MH.pos] = F.mp; MH.pos = (MH.pos + 1) % MH.rms.length; }
      c2.dkHist[c2.dkPos] = c2.dkAcc; c2.dkPos = (c2.dkPos + 1) % c2.dkHist.length; c2.dkAcc = 0;
    }
  }

  /* a drum with no pitch to follow (Fixed) takes a color of its own model, so a kit is not all one hue */
  var DRUM_HUES = [10, 45, 190, 215, 300, 28, 160, 265];
  function drumHue(s) {
    if (!ORDER[0] || Math.round(sval(s, "inst")) !== 1 || Math.round(sval(s, "rhy_pitch")) !== 0 || Math.round(sval(s, "gen")) !== 4) return null;
    return DRUM_HUES[Math.round(sval(s, "drum_model"))] || 0;
  }

  /* ------------------------------------------------------------- state */
  // open: the channels open in the accordion; grps / secs: per channel, the groups (gen, inst, fx) and the sections
  // open in it; everything shut at first. single: one at a time (the default): opening a channel, a group or a
  // section closes the others beside it, and switching it on shuts everything but `last`, the last thing opened
  // {ch, grp, sec}. sel: the channel last opened. Kept per viewer in localStorage: the page's own, not the patch's.
  // uiv: what was kept before 2 (any number open, groups open unless folded, a channel's pattern open at first) is
  // not taken back. page: the patch's page state, carried for desktop (ammo.page).
  var ui = { tab: 'channels', sel: 0, open: {}, secs: {}, grps: {}, last: null, single: true, page: null, uiv: 2 };
  var KEEP = ['tab', 'open', 'secs', 'grps', 'last', 'single', 'page', 'uiv'];
  /* each section's group */
  var GRP_OF = { pat: 'gen', pitch: 'gen', chord: 'gen', drum: 'inst', osc: 'inst', filt: 'inst', amp: 'inst',
                 drive: 'fx', cho: 'fx', dly: 'fx', rev: 'fx', duck: 'fx' };
  function secsOf(s) { return ui.secs[s] || {}; }
  function isOpen(s) { return !!ui.open[s]; }
  function grpOpen(s, key) { return !!(ui.grps[s] && ui.grps[s][key]); }
  try {
    var saved = JSON.parse(localStorage.getItem('ammo.mini.ui') || '{}');
    if (saved.uiv !== ui.uiv) ['open', 'secs', 'shut', 'single', 'uiv'].forEach(function (k) { delete saved[k]; });
    KEEP.forEach(function (k) { if (saved[k] != null) ui[k] = saved[k]; });
  } catch (e) { /* no storage */ }
  if (ui.tab !== 'conductor') ui.tab = 'channels';
  for (var o0 in ui.open) if (ui.open[o0]) ui.sel = +o0; // an open channel is the one selected
  function saveUi() { try { var o = {}; KEEP.forEach(function (k) { o[k] = ui[k]; }); localStorage.setItem('ammo.mini.ui', JSON.stringify(o)); } catch (e) { /* no storage */ } }

  var structure = true, dirty = true, drag = null, hover = null, T = 0, t0 = performance.now(), lastRefresh = 0, reveal = false;

  function activeSlots() { var out = []; for (var s = 0; s < SLOTS; s++) if (sval(s, 'gen') > 0) out.push(s); return out; }
  function slotName(s) { return 'Channel ' + (s + 1); }
  var GEN_ARP = 1, GEN_CHORD = 2, GEN_BASS = 3, GEN_RHYTHM = 4, INST_DRUM = 1;
  var STRUCT = { gen: 1, chord_rhythm: 1, inst: 1, cho_mode: 1 }; // parameters that change which sections (or knobs) a channel has
  function isDrum(s) { return Math.round(sval(s, 'inst')) === INST_DRUM; }
  function hitsOf(s) { var len = Math.round(sval(s, 'arp_len')); return Math.floor(sval(s, 'arp_density') * len + 0.5) + '/' + len; }
  function genOf(s) { return Math.round(sval(s, 'gen')); }
  function holds(s) { return Math.round(sval(s, 'chord_rhythm')) === 0; }
  function chordArp(s) { return Math.round(sval(s, 'chord_rhythm')) === 2; }
  function vibrato(s) { return s >= 0 && Math.round(sval(s, 'cho_mode')) === 2; } // all wet: MIX does nothing
  function chorusOn(s) { return sval(s, 'cho_on') >= 0.5 && (vibrato(s) || sval(s, 'cho_mix') > 0); }
  /** A channel's row subtitle: what its generator plays, in a line. */
  function slotSub(s) {
    var div = Knobs.fmt('div', sval(s, 'arp_div'));
    switch (genOf(s)) {
      case GEN_ARP: return nameOf(sid(s, 'arp_mode')) + ' · ' + nameOf(sid(s, 'arp_pool')) + ' · ' + div;
      case GEN_CHORD: return 'CHORD · ' + nameOf(sid(s, 'chord_notes')) + ' · ' + nameOf(sid(s, 'chord_voicing')) + ' · ' +
        (holds(s) ? 'HOLD' : chordArp(s) ? 'ARP ' + nameOf(sid(s, 'arp_mode')).toUpperCase() + ' · ' + div : div);
      case GEN_BASS: return 'BASS · ' + nameOf(sid(s, 'bass_pattern')) + ' · ' + div;
      case GEN_RHYTHM: return 'RHYTHM · ' + (isDrum(s) ? nameOf(sid(s, 'drum_model')) : 'SYNTH') + ' · ' + hitsOf(s) + ' · ' + div;
      default: return 'OFF';
    }
  }
  function keyName() { var sc = ORDER[gid('scale')]; return Knobs.NOTES[Math.round(gval('root')) % 12] + ' ' + (sc && sc.names ? sc.names[Math.round(gval('scale'))].toLowerCase() : ''); }
  function chordName() {
    var sc = Math.round(gval('scale')), pc = F.cr;
    return Knobs.NOTES[pc] + (sc >= 10 ? ORDER[gid('scale')].names[sc].toLowerCase() : QUAL[F.cq] || '');
  }

  function setParam(id, v, gesture) {
    var d = ORDER[id]; if (!d) return;
    if (d.steps > 0) v = Math.round(v);
    v = Math.max(d.min, Math.min(d.max, v));
    if (gesture) send('edit ' + id + ' 1');
    P[id] = v; send('set ' + id + ' ' + (d.steps > 0 ? v.toFixed(0) : v.toFixed(5)));
    if (gesture) send('edit ' + id + ' 0');
    if (STRUCT[d.s]) structure = true; else dirty = true;
  }

  /* patch files and recording: the host shows the dialogs and writes the files */
  function pageState() { return ui.page || { v: 1, looks: {}, vp: {}, view: 'nested' }; }
  function savePatch() { send('save ' + JSON.stringify(pageState())); }
  function openPatch() { send('open'); }
  function toggleRec() { send('record ' + (rec.on ? 0 : 1)); }
  function fmtTime(secs) { var t = Math.max(0, Math.floor(secs)); return Math.floor(t / 60) + ':' + ('0' + t % 60).slice(-2); }
  var elToast = null, toastUntil = 0;
  function toast(text) {
    if (!elToast) { elToast = document.createElement('div'); elToast.id = 'toast'; elUI.appendChild(elToast); }
    elToast.textContent = text; elToast.title = text; elToast.classList.add('show');
    toastUntil = performance.now() + 6000;
  }

  /* --------------------------------------------------------------- DOM */
  var $ = function (id) { return document.getElementById(id); };
  var elUI = $('ui'), elPanel = $('panel'), elStats = $('stats');
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function knobCell(id, label, compact) {
    return '<div class="kcell' + (compact ? ' compact' : '') + '"><canvas class="knob" data-id="' + id + '"></canvas><span class="klab">' + esc(label) + '</span></div>';
  }
  /** Chips for a stepped parameter; `from`: the first of its values to offer (the ones below are hidden). */
  function chipRow(id, label, from) {
    var d = ORDER[id], v = Math.round(val(id)), out = '<div class="chips" data-chips="' + id + '">' + (label ? '<span class="lab">' + esc(label) + '</span>' : '');
    for (var i = from || 0; i < d.names.length; i++) {
      var sv = d.min + i;
      out += '<button class="chip" data-id="' + id + '" data-val="' + sv + '" aria-pressed="' + (v === sv ? 'true' : 'false') + '">' + esc(d.names[i]) + '</button>';
    }
    return out + '</div>';
  }
  function selectEl(id) {
    var d = ORDER[id], v = Math.round(val(id)), out = '<select class="sel" data-id="' + id + '">';
    for (var i = 0; i < d.names.length; i++) { var sv = d.min + i; out += '<option value="' + sv + '"' + (v === sv ? ' selected' : '') + '>' + esc(d.names[i]) + '</option>'; }
    return out + '</select>';
  }
  function group(title, body, extra) {
    return '<section class="group"><div class="gtitle"><span>' + title + '</span>' + (extra || '') + '</div>' + body + '</section>';
  }
  /** A section inside an open channel; any number open at once. Closed, its head shows a summary. */
  function csec(s, key, title, body) {
    var open = !!secsOf(s)[key], ref = s + ':' + key;
    return '<div class="sec' + (open ? ' open' : '') + '"><button class="sechead" data-csec="' + ref + '" aria-expanded="' + open + '"><span class="chev">' + (open ? '▾' : '▸') + '</span>' +
      '<span class="t">' + title + '</span><span class="sum" data-sum="' + ref + '"></span></button>' +
      (open ? '<div class="secbody">' + body + '</div>' : '') + '</div>';
  }
  /** A group in an open channel (GENERATOR, INSTRUMENT, EFFECTS, VISUAL): a band its label opens and folds; while
      open its head (the chips) sits on the band and its sections below, set in; while folded a summary. */
  function cgrp(s, key, title, head, inner) {
    var shut = !grpOpen(s, key), ref = s + ':' + key;
    return '<div class="cgrp' + (shut ? '' : ' open') + '"><div class="cgroup"><button class="cghead" data-cgrp="' + ref + '" aria-expanded="' + !shut + '" title="' +
      (shut ? 'Open ' : 'Fold ') + title.toLowerCase() + '"><span class="chev">' + (shut ? '▸' : '▾') + '</span><span class="cglab">' + title + '</span></button>' +
      (shut ? '<span class="cgsum" data-sum="' + ref + '"></span></div></div>' : head + '</div><div class="grpbody">' + inner + '</div></div>');
  }
  /** A section's body: its view on the left, its knobs (up to six) on the right. */
  function srow(view, slot, cells) {
    var out = '<div class="srow"><canvas class="viz ' + view + '" data-slot="' + slot + '"></canvas><div class="knobs">' + cells.join('');
    for (var i = cells.length; i < 6; i++) out += '<div></div>';
    return out + '</div></div>';
  }
  var SAVE_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M12 3v11"></path><path d="M7.5 9.5 12 14l4.5-4.5"></path><path d="M4 15v3.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V15"></path></svg>';
  var OPEN_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M3 7.5V18a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9.5a2 2 0 0 0-2-2h-7L10 5H5a2 2 0 0 0-2 2.5z"></path></svg>';
  var LOGO = '<svg width="26" height="26" viewBox="-2 4 24 24" fill="none" stroke="#efe6d8" stroke-width="1.6" stroke-linecap="round"><path d="M15 14 a1 1 0 0 1 -1 1 a2 2 0 0 1 -2 -2 a3 3 0 0 1 3 -3 a5 5 0 0 1 5 5 a8 8 0 0 1 -8 8 a13 13 0 0 1 -13 -13"></path></svg>';

  /** The DOM from scratch: on structural changes only. The scroll position is kept within a tab. */
  function build() {
    structure = false; dirty = false;
    if (!ORDER[0]) return;
    var act0 = activeSlots();
    if (act0.length && act0.indexOf(ui.sel) < 0) ui.sel = act0[0];
    var body = elPanel.querySelector('.pbody'), scroll = body ? body.scrollTop : 0, sameTab = body && body.getAttribute('data-tab') === ui.tab;
    elPanel.className = 'glass';
    var play = '<button class="playbtn" data-act="play" title="Play / stop (Space)"><span data-txt="play"></span></button>';
    var recb = '<button class="recbtn" data-act="rec" title="Record the output to a WAV file (R)"><span class="rdot"></span><span class="rtime" data-txt="rectime"></span></button>';
    var slots = activeSlots(), tabs = [['conductor', 'CONDUCTOR', ''], ['channels', 'CHANNELS', '<b>' + slots.length + '</b>']];
    var out = '<div class="ptop">' + LOGO + '<span class="brand">AMMONITE</span>' +
      '<div class="preset"><button data-act="preset-prev" title="Previous preset">‹</button><span class="name" data-txt="preset"></span><button data-act="preset-next" title="Next preset">›</button></div>' +
      '<button class="iconbtn" data-act="save" title="Save the patch to a file (Ctrl+S)">' + SAVE_SVG + '</button>' +
      '<button class="iconbtn" data-act="open" title="Open a patch file (Ctrl+O)">' + OPEN_SVG + '</button>' +
      '<div class="grow"></div>' + recb + play + '</div>' +
      '<div class="tabs" role="tablist">';
    tabs.forEach(function (t) { out += '<button class="tab" role="tab" data-tab="' + t[0] + '" aria-selected="' + (ui.tab === t[0]) + '">' + t[1] + (t[2] ? ' ' + t[2] : '') + '</button>'; });
    out += '</div><div class="pbody" data-tab="' + ui.tab + '">' + (ui.tab === 'conductor' ? conductorHtml() : channelsHtml(slots)) + '</div>';
    elPanel.innerHTML = out;
    body = elPanel.querySelector('.pbody');
    if (sameTab) body.scrollTop = scroll;
    if (reveal) { var open = body.querySelector('.ch[data-ch="' + ui.sel + '"]'); if (open) open.scrollIntoView({ block: 'nearest' }); reveal = false; }
    refresh();
  }

  function conductorHtml() {
    var four = function (cells) { return '<div class="knobs">' + cells.join('') + '<div></div><div></div></div>'; };
    return '<div class="cgrid">' +
      group('HARMONY',
        '<div class="wheelrow"><canvas class="wheel"></canvas><div class="keybox"><span class="lab">KEY</span><span class="big" data-txt="key"></span>' +
          '<span class="chordnow">now <b data-txt="chord"></b> <span data-txt="progpos"></span></span>' +
          '<div class="row center"><span class="lab w64">SCALE</span>' + selectEl(gid('scale')) + '</div>' +
          '<div class="row">' + knobCell(gid('root'), 'Root') + '</div></div></div>') +
      group('PROGRESSION',
        '<div class="row center">' + selectEl(gid('prog')) + '</div><canvas class="prog"></canvas>' +
        '<div data-chips-prog="1"></div>' + chipRow(gid('change'), 'CHANGE') + chipRow(gid('restart'), 'RESTART')) +
      group('TIME',
        '<div class="row center" style="gap:14px"><span class="big tempo" data-txt="tempo"></span><span class="lab">BPM</span></div>' +
        four([knobCell(gid('tempo'), 'Tempo'), knobCell(gid('swing'), 'Swing'), knobCell(gid('octave'), 'Octave'), knobCell(gid('volume'), 'Volume')])) +
      group('MACROS', four([knobCell(gid('macro1'), 'Bloom'), knobCell(gid('macro2'), 'Motion'), knobCell(gid('macro3'), 'Space'), knobCell(gid('macro4'), 'Grit')])) +
      wideGroup('SPACE', srow('spaceview', -1, [knobCell(gid('rev_size'), 'Size'), knobCell(gid('rev_decay'), 'Decay'), knobCell(gid('rev_damp'), 'Damping'),
        knobCell(gid('rev_pre'), 'Pre-delay'), knobCell(gid('rev_width'), 'Width'), knobCell(gid('rev_return'), 'Return')]) +
        '<div class="hint flush">The reverb every channel shares: each channel\'s SEND (in its Effects) sets how much of it goes in.</div>') +
      wideGroup('MASTER', srow('masterview', -1, [knobCell(gid('glue'), 'Glue'), knobCell(gid('ceiling'), 'Ceiling'), knobCell(gid('volume'), 'Volume')]) +
        '<div class="hint flush">Glue: a gentle compressor that holds the mix together (its make-up keeps the level). Ceiling: nothing passes it.</div>') +
      '</div>';
  }
  function wideGroup(title, body) { return group(title, body).replace('<section class="group">', '<section class="group wide">'); }

  function channelsHtml(slots) {
    var html = slots.length ? '<div class="chopts"><span class="lab">SECTIONS</span><div class="chips">' +
      '<button class="chip" data-act="single" data-single="0" aria-pressed="' + !ui.single + '" title="Open any number of channels, groups and sections">Many open</button>' +
      '<button class="chip" data-act="single" data-single="1" aria-pressed="' + ui.single + '" title="Opening a channel, group or section closes the others; ' +
        'switching this on shuts everything but the last one opened">One at a time</button></div></div>' : '';
    for (var i = 0; i < slots.length; i++) html += channelHtml(slots[i]);
    if (!slots.length) html += '<div class="empty">No channels playing. Add one to start a pattern.</div>';
    if (slots.length < SLOTS) html += '<button class="addbtn" data-act="add">+ Add channel</button>';
    return html;
  }

  /** One channel: the row (always), and what it contains (when open): the generator's sections, the instrument's, its effects. */
  function channelHtml(s) {
    var open = isOpen(s), k = function (sym, label) { return knobCell(sid(s, sym), label); };
    var html = '<div class="ch' + (open ? ' open' : '') + '" data-ch="' + s + '"><div class="chrow">' +
      '<button class="chpick" data-pick="' + s + '" aria-expanded="' + open + '"><span class="chev">' + (open ? '▾' : '▸') + '</span><canvas class="bar" data-slot="' + s + '"></canvas>' +
        '<span class="names"><span class="nm">' + slotName(s) + '</span><span class="sub" data-chsub="' + s + '"></span></span></button>' +
      '<canvas class="scope" data-pick="' + s + '" data-slot="' + s + '"></canvas>' +
      '<span class="note" data-note="' + s + '"></span>' +
      '<canvas class="hfader" data-id="' + sid(s, 'level') + '" title="Level"></canvas>' +
      '<canvas class="hfader pan" data-id="' + sid(s, 'pan') + '" title="Pan"></canvas>' +
      '<button class="tog mute" data-id="' + sid(s, 'mute') + '" data-toggle="1" title="Mute">M</button></div>';
    if (!open) return html + '</div>';
    var gen = genOf(s);
    var body = '';
    var rhythm = [k('arp_div', 'Division'), k('arp_len', 'Length'), k('arp_density', 'Density'), k('arp_gate', 'Gate'), k('arp_vary', 'Vary'), k('arp_ratchet', 'Ratchet')];
    if (gen === GEN_ARP) {
      body += csec(s, 'pat', 'PATTERN', '<div class="chipline">' + chipRow(sid(s, 'arp_mode'), 'MODE') + chipRow(sid(s, 'arp_pool'), 'POOL') + '</div>' + srow('stepview', s, rhythm)) +
        csec(s, 'pitch', 'PITCH', srow('rollview', s, [k('degree', 'Degree'), k('oct', 'Octave'), k('arp_range', 'Range')]));
    } else if (gen === GEN_CHORD) {
      // Arp: the arp's patterns (Off and Loop play as Up, so not offered) and Let ring; no strum
      var arp = chordArp(s);
      body += csec(s, 'chord', 'CHORD', '<div class="chipline">' + chipRow(sid(s, 'chord_notes'), 'NOTES') + chipRow(sid(s, 'chord_voicing'), 'VOICING') + '</div>' +
          '<div class="chipline">' + chipRow(sid(s, 'chord_lead'), 'LEADING') + chipRow(sid(s, 'chord_rhythm'), 'RHYTHM') + '</div>' +
          (arp ? '<div class="chipline">' + chipRow(sid(s, 'arp_mode'), 'MODE', 2) + chipRow(sid(s, 'chord_ring'), 'LET RING') + '</div>' : '') +
          srow('chordview', s, [k('degree', 'Degree'), k('oct', 'Octave')].concat(arp ? [] : [k('chord_strum', 'Strum')])));
      if (!holds(s)) body += csec(s, 'pat', 'PATTERN', srow('stepview', s, arp ? rhythm : rhythm.slice(0, 4)));
    } else if (gen === GEN_RHYTHM) {
      body += csec(s, 'pat', 'PATTERN', srow('stepview', s, [k('arp_div', 'Division'), k('arp_len', 'Length'), k('arp_density', 'Hits'),
          k('rhy_rotate', 'Rotate'), k('rhy_chance', 'Chance'), k('arp_ratchet', 'Roll')])) +
        csec(s, 'pitch', 'FEEL', '<div class="chipline">' + chipRow(sid(s, 'rhy_pitch'), 'PITCH') + '</div>' +
          srow('rollview', s, [k('arp_vary', 'Humanize'), k('arp_gate', 'Gate'), k('oct', 'Octave'), k('degree', 'Degree')]));
    } else if (gen === GEN_BASS) {
      body += csec(s, 'pat', 'PATTERN', '<div class="chipline">' + chipRow(sid(s, 'bass_pattern'), 'PATTERN') + '</div>' + srow('stepview', s, rhythm)) +
        csec(s, 'pitch', 'PITCH', srow('rollview', s, [k('degree', 'Degree'), k('oct', 'Octave')]));
    }
    body = cgrp(s, 'gen', 'GENERATOR', chipRow(sid(s, 'gen'), ''), body);
    var inst = '';
    if (isDrum(s)) inst += csec(s, 'drum', 'DRUM', '<div class="chipline">' + chipRow(sid(s, 'drum_model'), 'MODEL') + '</div>' +
      srow('drumview', s, [k('drum_tune', 'Tune'), k('drum_decay', 'Decay'), k('drum_tone', 'Tone'), k('drum_snap', 'Snap')]));
    else inst += csec(s, 'osc', 'OSCILLATOR', srow('waveview', s, [k('shape', 'Shape'), k('detune', 'Detune'), k('sub', 'Sub'), k('noise', 'Noise'), k('drive', 'Drive'), k('glide', 'Glide')])) +
      csec(s, 'filt', 'FILTER', srow('filtview', s, [k('cutoff', 'Cutoff'), k('reso', 'Reso'), k('filter_type', 'Type'), k('filt_amt', 'Env amt'), k('filt_a', 'Attack'), k('filt_d', 'Decay')])) +
      csec(s, 'amp', 'AMP', srow('envview', s, [k('amp_a', 'Attack'), k('amp_d', 'Decay'), k('amp_s', 'Sustain'), k('amp_r', 'Release'), k('pitch_amt', 'Pitch env'), k('pitch_d', 'Pitch dec')]));
    body += cgrp(s, 'inst', 'INSTRUMENT', chipRow(sid(s, 'inst'), ''), inst) + cgrp(s, 'fx', 'EFFECTS', '', effectsHtml(s, k));
    return html + '<div class="chbody">' + body + '</div></div>';
  }

  /** The channel's EFFECTS, after the instrument, in the order the sound passes them: Drive, Chorus, Delay, then the
      reverb send and the duck. */
  function effectsHtml(s, k) {
    return csec(s, 'drive', 'DRIVE', srow('driveview', s, [k('fx_drive', 'Amount'), k('fx_tone', 'Tone')])) +
      csec(s, 'cho', 'CHORUS', '<div class="chipline">' + chipRow(sid(s, 'cho_on'), 'CHORUS') + chipRow(sid(s, 'cho_mode'), 'MODE') + '</div>' +
        srow('chorusview', s, [k('cho_rate', 'Rate'), k('cho_depth', 'Depth')].concat(vibrato(s) ? [] : [k('cho_mix', 'Mix')]))) +
      csec(s, 'dly', 'DELAY', '<div class="chipline">' + chipRow(sid(s, 'dly_div'), 'DIVISION') + chipRow(sid(s, 'dly_pp'), 'PING-PONG') + '</div>' +
        srow('delayview', s, [k('dly_fb', 'Feedback'), k('dly_damp', 'Damping'), k('dly_mix', 'Mix')])) +
      csec(s, 'rev', 'REVERB', srow('revview', s, [k('rev_send', 'Send')]) +
        '<div class="hint flush">How much of it goes into the reverb every channel shares (its size, decay and return: the Conductor\'s SPACE).</div>') +
      csec(s, 'duck', 'DUCK', '<div class="chipline"><div class="row center"><span class="lab w64">DUCK BY</span>' + selectEl(sid(s, 'duck_src')) + '</div></div>' +
        srow('duckview', s, [k('duck_amt', 'Amount')]));
  }

  /** Values into the DOM in place: texts, chip states, selects, toggles. */
  function refresh() {
    dirty = false; lastRefresh = performance.now();
    var txt = function (key, s) { document.querySelectorAll('[data-txt="' + key + '"]').forEach(function (el) { if (el.textContent !== s) el.textContent = s; }); };
    var pr = PRESETS[presetNow];
    txt('preset', patchFile || (pr ? pr.n : '—'));
    document.querySelectorAll('[data-txt="preset"]').forEach(function (el) { el.title = patchFile ? 'Patch file: ' + patchFile : pr ? pr.b : ''; });
    txt('rectime', rec.on ? fmtTime((performance.now() - rec.t0) / 1000) : '');
    document.querySelectorAll('.recbtn').forEach(function (b) { if (b.classList.contains('on') !== rec.on) b.classList.toggle('on', rec.on); });
    txt('key', keyName()); txt('chord', chordName());
    txt('progpos', F.pl > 0 ? '· ' + (F.pp + 1) + '/' + F.pl : '· ' + ROMAN[F.cd % 7]);
    txt('tempo', (F.bpm ? F.bpm : gval('tempo')).toFixed(F.bpm && Math.abs(F.bpm - Math.round(F.bpm)) > 0.05 ? 1 : 0));
    document.querySelectorAll('[data-chsub]').forEach(function (el) { var s = slotSub(+el.getAttribute('data-chsub')); if (el.textContent !== s) el.textContent = s; });
    document.querySelectorAll('[data-txt="play"]').forEach(function (el) {
      var want = F.playing ? 'pause' : 'play';
      if (el.getAttribute('data-state') !== want) {
        el.setAttribute('data-state', want);
        el.innerHTML = F.playing ? '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="2" width="3.5" height="12" rx="1"></rect><rect x="9.5" y="2" width="3.5" height="12" rx="1"></rect></svg>'
                                 : '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.5 L13.5 8 L4 13.5 Z"></path></svg>';
      }
    });
    // chips and toggles
    document.querySelectorAll('button.chip[data-id]').forEach(function (b) {
      var want = Math.round(val(+b.getAttribute('data-id'))) === +b.getAttribute('data-val') ? 'true' : 'false';
      if (b.getAttribute('aria-pressed') !== want) b.setAttribute('aria-pressed', want);
    });
    document.querySelectorAll('[data-toggle]').forEach(function (b) {
      var onv = val(+b.getAttribute('data-id')) >= 0.5 ? 'true' : 'false';
      if (b.getAttribute('aria-pressed') !== onv) b.setAttribute('aria-pressed', onv);
    });
    document.querySelectorAll('select.sel').forEach(function (sl) {
      if (document.activeElement === sl) return;
      var v = String(Math.round(val(+sl.getAttribute('data-id'))));
      if (sl.value !== v) sl.value = v;
    });
    // the chord chips above the change: the manual chord while the progression is off
    document.querySelectorAll('[data-chips-prog]').forEach(function (el) {
      var off = Math.round(gval('prog')) === 0, has = el.getAttribute('data-has') === '1';
      if (off && !has) { el.innerHTML = chipRow(gid('chord'), 'CHORD'); el.setAttribute('data-has', '1'); }
      else if (!off && has) { el.innerHTML = ''; el.setAttribute('data-has', '0'); }
    });
    // a closed section's head: what is in it, in a line
    var U = { min: 0, max: 1 }, f = function (s, sym, fm) { return Knobs.fmt(fm, sval(s, sym), ORDER[sid(s, sym)]); };
    var SUMS = {
      pat: function (s) {
        if (genOf(s) === GEN_RHYTHM) return hitsOf(s) + ' hits · ' + Knobs.fmt('div', sval(s, 'arp_div')) + (Math.round(sval(s, 'rhy_rotate')) ? ' · rotate ' + Math.round(sval(s, 'rhy_rotate')) : '') +
          (sval(s, 'rhy_chance') < 0.99 ? ' · chance ' + f(s, 'rhy_chance', 'pct') : '');
        return (genOf(s) === GEN_CHORD ? Knobs.fmt('div', sval(s, 'arp_div')) : slotSub(s).toLowerCase()) + ' · ' + Math.round(sval(s, 'arp_len')) + ' steps · density ' + f(s, 'arp_density', 'pct'); },
      drum: function (s) { return (nameOf(sid(s, 'drum_model')) + ' · tune ' + f(s, 'drum_tune', 'sint') + ' · decay ' + f(s, 'drum_decay', 'pct') +
                                  ' · tone ' + f(s, 'drum_tone', 'pct')).toLowerCase(); },
      chord: function (s) { return (nameOf(sid(s, 'chord_notes')) + ' · ' + nameOf(sid(s, 'chord_voicing')) + ' · ' + nameOf(sid(s, 'chord_lead')) + ' · ' + nameOf(sid(s, 'chord_rhythm'))).toLowerCase() +
                                   (chordArp(s) ? ' ' + nameOf(sid(s, 'arp_mode')).toLowerCase() + (sval(s, 'chord_ring') >= 0.5 ? ' · let ring' : '')
                                                : sval(s, 'chord_strum') > 0.01 ? ' · strum ' + f(s, 'chord_strum', 'pct') : ''); },
      pitch: function (s) { return 'degree ' + f(s, 'degree', 'deg') + ' · octave ' + f(s, 'oct', 'octs') + (genOf(s) === GEN_ARP ? ' · range ' + f(s, 'arp_range', 'range') : ''); },
      osc: function (s) { return 'shape ' + f(s, 'shape', 'pct') + ' · detune ' + f(s, 'detune', 'cents') + (sval(s, 'sub') > 0.01 ? ' · sub ' + f(s, 'sub', 'pct') : ''); },
      filt: function (s) { return Knobs.fmt('type', sval(s, 'filter_type'), U) + ' ' + Knobs.fmt('hz', sval(s, 'cutoff'), U) + ' · reso ' + f(s, 'reso', 'pct'); },
      amp: function (s) { return 'A ' + f(s, 'amp_a', 'att') + ' · D ' + f(s, 'amp_d', 'dec') + ' · S ' + f(s, 'amp_s', 'pct') + ' · R ' + f(s, 'amp_r', 'dec'); },
      drive: function (s) { return sval(s, 'fx_drive') <= 0 ? 'off' : 'amount ' + f(s, 'fx_drive', 'pct') + ' · tone ' + f(s, 'fx_tone', 'bip'); },
      cho: function (s) { return !chorusOn(s) ? 'off' : nameOf(sid(s, 'cho_mode')).toLowerCase() + ' · rate ' + f(s, 'cho_rate', vibrato(s) ? 'vhz' : 'chz') + ' · depth ' + f(s, 'cho_depth', 'pct') +
                                 (vibrato(s) ? '' : ' · mix ' + f(s, 'cho_mix', 'pct')); },
      dly: function (s) { return sval(s, 'dly_mix') <= 0 ? 'off' : nameOf(sid(s, 'dly_div')) + ' · feedback ' + f(s, 'dly_fb', 'pct') + ' · mix ' + f(s, 'dly_mix', 'pct') + (sval(s, 'dly_pp') >= 0.5 ? ' · ping-pong' : ''); },
      rev: function (s) { return sval(s, 'rev_send') > 0 ? 'send ' + f(s, 'rev_send', 'pct') : 'off'; },
      duck: function (s) { return ducked(s) ? 'by ' + slotName(Math.round(sval(s, 'duck_src')) - 1) + ' · ' + f(s, 'duck_amt', 'pct') : 'off'; },
      gen: function (s) { return nameOf(sid(s, 'gen')).toLowerCase() + ' · ' + SUMS[genOf(s) === GEN_CHORD ? 'chord' : 'pat'](s); },
      inst: function (s) { return nameOf(sid(s, 'inst')).toLowerCase() + ' · ' + SUMS[isDrum(s) ? 'drum' : 'osc'](s); },
      fx: function (s) {
        var out = [];
        if (sval(s, 'fx_drive') > 0) out.push('drive');
        if (chorusOn(s)) out.push(nameOf(sid(s, 'cho_mode')).toLowerCase());
        if (sval(s, 'dly_mix') > 0) out.push('delay ' + nameOf(sid(s, 'dly_div')));
        if (sval(s, 'rev_send') > 0) out.push('reverb ' + f(s, 'rev_send', 'pct'));
        if (ducked(s)) out.push('ducked');
        return out.length ? out.join(' · ') : 'none';
      } };
    document.querySelectorAll('[data-sum]').forEach(function (el) {
      var ref = el.getAttribute('data-sum').split(':'), s = +ref[0], t = secsOf(s)[ref[1]] && !el.classList.contains('cgsum') ? '' : SUMS[ref[1]](s);
      if (el.textContent !== t) el.textContent = t;
    });
  }

  /* ------------------------------------------------------------ events */
  /** What was opened last, for One at a time to keep when it is switched on. */
  function remember(s, grp, sec) { ui.last = { ch: s, grp: grp || null, sec: sec || null }; }
  /** One at a time switched on: everything shut but the last thing opened (its channel, group and section). */
  function snapShut() {
    var L = ui.last;
    ui.open = {}; ui.grps = {}; ui.secs = {};
    if (!L || L.ch == null || sval(L.ch, 'gen') <= 0) return;
    ui.open[L.ch] = true; ui.sel = L.ch;
    if (L.grp) { ui.grps[L.ch] = {}; ui.grps[L.ch][L.grp] = true; }
    if (L.sec && GRP_OF[L.sec] === L.grp) { ui.secs[L.ch] = {}; ui.secs[L.ch][L.sec] = true; }
  }
  /** A channel opened: in One at a time the only one. */
  function openChannel(s) {
    if (ui.single) ui.open = {};
    ui.open[s] = true; ui.sel = s; reveal = true;
    if (!ui.last || ui.last.ch !== s) remember(s);
  }
  function pick(s) {
    if (isOpen(s)) { delete ui.open[s]; if (ui.last && ui.last.ch === s) ui.last = null; }
    else openChannel(s);
    structure = true; saveUi();
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('button,[data-pick]') : null;
    if (!t) return;
    var act = t.getAttribute('data-act');
    if (t.hasAttribute('data-tab')) { ui.tab = t.getAttribute('data-tab'); structure = true; saveUi(); return; }
    if (t.hasAttribute('data-pick')) { pick(+t.getAttribute('data-pick')); return; }
    if (t.hasAttribute('data-csec')) {
      var ref = t.getAttribute('data-csec').split(':'), cs = +ref[0], o = {}, cur = secsOf(cs), opening = !cur[ref[1]];
      if (!ui.single || !opening) for (var key in cur) o[key] = cur[key];
      o[ref[1]] = opening; ui.secs[cs] = o; ui.sel = cs;
      if (opening) remember(cs, GRP_OF[ref[1]], ref[1]);
      else if (ui.last && ui.last.ch === cs && ui.last.sec === ref[1]) ui.last.sec = null;
      structure = true; saveUi(); return;
    }
    if (t.hasAttribute('data-cgrp')) {
      var gref = t.getAttribute('data-cgrp').split(':'), gs = +gref[0], gid0 = gref[1], g = {}, gcur = ui.grps[gs] || {}, gopen = !gcur[gid0];
      if (!ui.single || !gopen) for (var gk in gcur) g[gk] = gcur[gk];
      g[gid0] = gopen; ui.grps[gs] = g; ui.sel = gs;
      if (gopen) {
        // One at a time: the sections of the other groups close with them
        var sc = secsOf(gs), keepS = {}, lastS = null;
        for (var sk in sc) if (sc[sk] && (!ui.single || GRP_OF[sk] === gid0)) { keepS[sk] = true; if (GRP_OF[sk] === gid0) lastS = sk; }
        ui.secs[gs] = keepS; remember(gs, gid0, lastS);
      } else if (ui.last && ui.last.ch === gs && ui.last.grp === gid0) { ui.last.grp = null; ui.last.sec = null; }
      structure = true; saveUi(); return;
    }
    if (act === 'single') { ui.single = t.getAttribute('data-single') === '1'; if (ui.single) snapShut(); structure = true; saveUi(); return; }
    if (t.classList.contains('chip')) {
      var cid = +t.getAttribute('data-id'), cv = +t.getAttribute('data-val'), cd = ORDER[cid];
      setParam(cid, cv, true);
      if (cd && cd.s === 'gen' && cv === GEN_RHYTHM && !isDrum(cd.slot)) setParam(sid(cd.slot, 'inst'), INST_DRUM, true); // a rhythm wants a drum
      return;
    }
    if (t.hasAttribute('data-toggle')) { var id = +t.getAttribute('data-id'); setParam(id, val(id) >= 0.5 ? 0 : 1, true); return; }
    if (act === 'play') { send('key 1 32 0'); send('key 0 32 0'); }
    else if (act === 'save') savePatch();
    else if (act === 'open') openPatch();
    else if (act === 'rec') toggleRec();
    else if (act === 'add') {
      var slots = activeSlots();
      for (var s = 0; s < SLOTS; s++) if (slots.indexOf(s) < 0) { setParam(sid(s, 'gen'), 1, true); ui.tab = 'channels'; openChannel(s); saveUi(); break; }
      structure = true;
    }
    else if (act === 'preset-prev' || act === 'preset-next') {
      var n = PRESETS.length, d = act === 'preset-next' ? 1 : -1; if (!n) return;
      send('preset ' + (presetNow < 0 ? (d > 0 ? 0 : n - 1) : (presetNow + d + n) % n)); // from a file: the first or the last
    }
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.tagName === 'SELECT' && t.hasAttribute('data-id')) { setParam(+t.getAttribute('data-id'), +t.value, true); t.blur(); }
  });

  /* knobs drag up and down, faders left and right, by finger, pen or mouse; a double-tap resets, the wheel nudges.
     Fine (a quarter of the speed): Shift, or a second finger held anywhere while dragging. That finger only holds:
     it moves nothing, ends nothing, and its tap clicks nothing. A drag starts past SLOP px, so a tap never nudges. */
  var SLOP = 4, held = {}, nHeld = 0, quietUntil = 0;
  function ctlOf(e) { var t = e.target; return t && t.classList && (t.classList.contains('knob') || t.classList.contains('hfader')) ? t : null; }
  function uiScale() { return Math.min(window.innerHeight / LAYOUT_H, window.innerWidth / MIN_W); }
  document.addEventListener('pointerdown', function (e) {
    if (drag) { if (!held[e.pointerId]) { held[e.pointerId] = true; nHeld++; } e.preventDefault(); return; }
    var cv = ctlOf(e); if (!cv || e.button !== 0) return;
    e.preventDefault();
    var id = +cv.getAttribute('data-id'), d = ORDER[id]; if (!d) return;
    var now = performance.now();
    if (cv._tapAt && now - cv._tapAt < 350) { setParam(id, d.def, true); cv._tapAt = 0; return; } // the second tap of two
    drag = { cv: cv, id: id, pid: e.pointerId, x: e.clientX, y: e.clientY, v: val(id), h: cv.classList.contains('hfader'), moved: false };
    send('edit ' + id + ' 1');
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
  });
  document.addEventListener('pointermove', function (e) {
    if (!drag) { hover = ctlOf(e); return; }
    if (e.pointerId !== drag.pid) return;
    if (!drag.moved) {
      if (Math.abs(drag.h ? e.clientX - drag.x : e.clientY - drag.y) < SLOP) return;
      drag.moved = true; drag.x = e.clientX; drag.y = e.clientY; return; // from here, without a jump
    }
    var d = ORDER[drag.id], range = d.max - d.min, fine = e.shiftKey || nHeld ? 0.25 : 1;
    var delta = drag.h ? (e.clientX - drag.x) / (drag.cv.clientWidth * uiScale()) : (drag.y - e.clientY) / (200 * uiScale());
    drag.v = Math.max(d.min, Math.min(d.max, drag.v + delta * fine * range));
    drag.x = e.clientX; drag.y = e.clientY;
    var v = d.steps > 0 ? Math.round(drag.v) : drag.v;
    if (P[drag.id] !== v) { P[drag.id] = v; send('set ' + drag.id + ' ' + (d.steps > 0 ? v.toFixed(0) : v.toFixed(5))); dirty = true; }
  });
  function pointerEnd(e) {
    if (held[e.pointerId]) { delete held[e.pointerId]; nHeld--; quietUntil = performance.now() + 400; return; }
    if (!drag || e.pointerId !== drag.pid) return;
    send('edit ' + drag.id + ' 0');
    drag.cv._tapAt = drag.moved || e.type === 'pointercancel' ? 0 : performance.now();
    drag = null;
  }
  document.addEventListener('pointerup', pointerEnd);
  document.addEventListener('pointercancel', pointerEnd);
  // a holding finger's tap (while dragging, or just after) is no click
  document.addEventListener('click', function (e) { if (drag || nHeld || performance.now() < quietUntil) { e.stopPropagation(); e.preventDefault(); } }, true);
  document.addEventListener('wheel', function (e) {
    var cv = ctlOf(e); if (!cv || !e.deltaY) return;
    e.preventDefault();
    var id = +cv.getAttribute('data-id'), d = ORDER[id]; if (!d) return;
    var step = d.steps > 0 ? 1 : (d.max - d.min) * (e.shiftKey ? 0.005 : 0.02);
    setParam(id, val(id) + (e.deltaY < 0 ? step : -step), true);
  }, { passive: false });
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  function fwdKey(e, down) {
    if (e.keyCode === 123) return;
    // the page's own: Ctrl+S save, Ctrl+O open, R record (on the key going down, not its repeats)
    if (e.ctrlKey && !e.altKey && !e.shiftKey && (e.keyCode === 83 || e.keyCode === 79)) {
      if (down && !e.repeat) { if (e.keyCode === 83) savePatch(); else openPatch(); }
      e.preventDefault(); return;
    }
    if (e.keyCode === 82 && !e.ctrlKey && !e.altKey && !e.metaKey) { if (down && !e.repeat) toggleRec(); e.preventDefault(); return; }
    if (window.AMMO_DEV && (e.keyCode === 116 || e.ctrlKey)) return; // in a browser: reload and devtools stay the browser's
    if (e.keyCode === 113) { if (down) elStats.style.display = elStats.style.display === 'block' ? 'none' : 'block'; e.preventDefault(); return; }
    if (document.activeElement && document.activeElement.tagName === 'SELECT') return;
    send('key ' + (down ? 1 : 0) + ' ' + e.keyCode + ' ' + (e.repeat ? 1 : 0));
    e.preventDefault();
  }
  window.addEventListener('keydown', function (e) { fwdKey(e, true); });
  window.addEventListener('keyup', function (e) { fwdKey(e, false); });

  /* ------------------------------------------------------- sub-visuals */
  function fit2d(cv) {
    var w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return null;
    var dpr = Math.min(2, (window.devicePixelRatio || 1) * uiScale());
    var W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    var ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h };
  }

  /* the circle of fifths: the key's notes, the chord's, and the notes sounding now */
  function drawWheel(cv) {
    var g = fit2d(cv); if (!g) return;
    var ctx = g.ctx, cx = g.w / 2, cy = g.h / 2, R = Math.min(g.w, g.h) / 2 - 36, i, pc;
    var sounding = {};
    for (var s = 0; s < SLOTS; s++) { var c = CH[s]; if (c.active && sval(s, 'mute') < 0.5) sounding[c.pc] = Math.max(sounding[c.pc] || 0, Math.min(1, c.amp)); }
    // chord tones joined
    var tones = [];
    for (pc = 0; pc < 12; pc++) if ((F.cm >> pc) & 1) tones.push(pc);
    if (tones.length > 1) {
      ctx.beginPath();
      for (i = 0; i < tones.length; i++) { var k = (tones[i] * 7) % 12, a = -Math.PI / 2 + k * Math.PI / 6; if (i) ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); else ctx.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); }
      ctx.closePath(); ctx.strokeStyle = 'rgba(239,230,216,0.18)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = Knobs.hsla(Knobs.hueOf(F.cr), 80, 50, 0.07); ctx.fill();
    }
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1; ctx.stroke();
    for (i = 0; i < 12; i++) {
      pc = (i * 7) % 12;
      var ang = -Math.PI / 2 + i * Math.PI / 6, x = cx + Math.cos(ang) * R, y = cy + Math.sin(ang) * R;
      var inKey = (F.km >> pc) & 1, inChord = (F.cm >> pc) & 1, isRoot = pc === F.cr, amp = sounding[pc] || 0, hue = Knobs.hueOf(pc);
      if (inKey) Knobs.glowDot(ctx, x, y, isRoot ? 6 : 4.5, hue, 85, inChord ? 0.8 : 0.3);
      else { ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fill(); }
      if (amp > 0.02) Knobs.glowDot(ctx, x, y, 7 + 9 * amp, hue, 92, amp);
      var lx = cx + Math.cos(ang) * (R + 15), ly = cy + Math.sin(ang) * (R + 15);
      Knobs.text(ctx, Knobs.NOTES[pc], lx, ly, (isRoot ? '600 ' : '500 ') + '12px ' + Knobs.SANS, inKey ? (isRoot ? '#efe6d8' : 'rgba(236,236,240,0.8)') : 'rgba(236,236,240,0.3)', 'center');
    }
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    Knobs.text(ctx, Knobs.NOTES[F.cr], cx, cy - 10, '600 34px ' + Knobs.SANS, Knobs.hsla(Knobs.hueOf(F.cr), 85, 68, 0.95), 'center');
    ctx.restore();
    Knobs.text(ctx, F.pl > 0 ? ROMAN[F.cd % 7] : (QUAL[F.cq] || 'chord'), cx, cy + 16, '500 12px ' + Knobs.MONO, 'rgba(220,220,228,0.6)', 'center');
  }

  function drawProg(cv) {
    var g = fit2d(cv); if (!g) return;
    var ctx = g.ctx, w = g.w, h = g.h;
    var prog = PROGS[Math.round(gval('prog'))] || [], degs = prog.length ? prog : [Math.round(gval('chord'))], n = degs.length, bw = w / n, i, j;
    var scale = Math.round(gval('scale')), root = Math.round(gval('root')), iv = SCALE_IV[scale < 10 ? scale : ([11, 15, 17].indexOf(scale) >= 0 ? 1 : 0)];
    var changeBeats = [2, 4, 8, 16][Math.round(gval('change'))], cur = prog.length ? F.pp : 0;
    for (i = 0; i < n; i++) {
      var d = degs[i], x = i * bw + 2, isCur = i === cur;
      var tones = [0, 2, 4].map(function (k) { var q = d + k; return (root + iv[q % iv.length] + 12 * Math.floor(q / iv.length)) % 12; });
      var gr = ctx.createLinearGradient(x, 0, x + bw, 0);
      for (j = 0; j < 3; j++) gr.addColorStop(j / 2, Knobs.hsla(Knobs.hueOf(tones[j]), 85, 50, isCur ? 0.42 : 0.1));
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, 1, bw - 4, h - 2, 7); else ctx.rect(x, 1, bw - 4, h - 2); ctx.fillStyle = gr; ctx.fill();
      var third = (12 + (tones[1] - tones[0])) % 12, name = Knobs.NOTES[tones[0]] + (third === 3 ? 'm' : '');
      Knobs.text(ctx, name, x + 10, h / 2, '600 ' + Math.round(h * 0.4) + 'px ' + Knobs.SANS, isCur ? Knobs.hsla(Knobs.hueOf(tones[0]), 90, 74, 1) : 'rgba(220,220,228,0.55)');
      Knobs.text(ctx, ROMAN[d % 7], x + bw - 12, h / 2, '500 11px ' + Knobs.MONO, 'rgba(220,220,228,0.45)', 'right');
    }
    if (prog.length) {
      var px = (((F.beat % (changeBeats * n)) + changeBeats * n) % (changeBeats * n)) / (changeBeats * n) * w;
      ctx.fillStyle = 'rgba(239,230,216,0.9)'; ctx.fillRect(px - 0.75, 0, 1.5, h);
    }
  }

  /* the arp's step lane: LENGTH steps, the Euclidean hits (each filled to its gate), the step playing now */
  function drawSteps(cv, slot) {
    var g = fit2d(cv); if (!g) return;
    var ctx = g.ctx, w = g.w, h = g.h, c = CH[slot];
    var len = Math.max(1, Math.round(sval(slot, 'arp_len'))), hits = Math.floor(sval(slot, 'arp_density') * len + 0.5), hue = hueOfSlot(slot), gate = sval(slot, 'arp_gate');
    var rot = genOf(slot) === GEN_RHYTHM ? Math.round(sval(slot, 'rhy_rotate')) % len : 0;
    pane(ctx, w, h);
    var x0 = 10, x1 = w - 10, top = 24, bot = h - 10, pad = 3, sw = (x1 - x0 - pad * (len - 1)) / len, cur = c.active ? c.step % len : -1;
    for (var i = 0; i < len; i++) {
      var on = (((i - rot + len) % len) * hits) % len < hits, x = x0 + i * (sw + pad), now = i === cur;
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, top, sw, bot - top, 4); else ctx.rect(x, top, sw, bot - top);
      ctx.fillStyle = on ? Knobs.hsla(hue, 60, 45, now ? 0.3 : 0.14) : 'rgba(255,255,255,0.04)'; ctx.fill();
      if (now) { ctx.strokeStyle = on ? Knobs.hsla(hue, 90, 70, 0.9) : 'rgba(239,230,216,0.5)'; ctx.lineWidth = 1; ctx.stroke(); }
      if (!on) continue;
      var gw = Math.max(3, sw * Math.max(0.05, gate));
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, top, gw, bot - top, 4); else ctx.rect(x, top, gw, bot - top);
      ctx.fillStyle = Knobs.hsla(hue, 85, now ? 66 : 55, now ? 0.9 : 0.42); ctx.fill();
      if (now) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.shadowBlur = 14; ctx.shadowColor = Knobs.hsla(hue, 90, 60, 0.9); ctx.fill(); ctx.restore(); }
    }
    caption(ctx, 'STEPS · ' + (cur >= 0 ? (cur + 1) + '/' : '') + len + ' · ' + hits + ' hits');
  }

  /* ---- the section views: each a dark pane with a caption top left */
  function pane(ctx, w, h) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(0, 0, w, h, 10); else ctx.rect(0, 0, w, h); ctx.fill();
  }
  function caption(ctx, s) { Knobs.text(ctx, s, 10, 12, '500 10px ' + Knobs.MONO, 'rgba(220,220,228,0.5)'); }
  function ducked(s) { var src = Math.round(sval(s, 'duck_src')) - 1; return src >= 0 && src !== s && sval(s, 'duck_amt') > 0; }
  function hueOfSlot(slot) { return CH[slot].hue == null ? 90 : CH[slot].hue; }
  function noteName(n) { return Knobs.NOTES[((Math.round(n) % 12) + 12) % 12] + Math.floor(Math.round(n) / 12 - 1); }

  /* oscillator: two cycles of its live wave, filled from the centre line, as bright as it is loud */
  function drawWave(cv, slot) {
    var g = fit2d(cv); if (!g) return;
    var ctx = g.ctx, w = g.w, h = g.h, c = CH[slot], hue = hueOfSlot(slot), sat = 92, amp = c.active ? Math.min(1, c.amp) : 0, k = 0.45 + 0.55 * amp, mid = h / 2 + 6, i;
    pane(ctx, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(10, mid); ctx.lineTo(w - 10, mid); ctx.stroke();
    var p = new Path2D(), N = 200, A = (h - 30) * 0.46;
    for (i = 0; i <= N; i++) {
      var u = i / N, ph = (u * 2 + T * 0.2) % 1, idx = Math.floor(ph * 128) % 128, y = mid - (c.active ? c.wave[idx] : 0) * A;
      if (i) p.lineTo(10 + (w - 20) * u, y); else p.moveTo(10, y);
    }
    var fill = new Path2D(p); fill.lineTo(w - 10, mid); fill.lineTo(10, mid); fill.closePath();
    var gr = ctx.createLinearGradient(0, mid - A, 0, mid + A);
    gr.addColorStop(0, Knobs.hsla(hue, sat, 60, 0.2 * k)); gr.addColorStop(0.5, Knobs.hsla(hue, sat, 50, 0.02)); gr.addColorStop(1, Knobs.hsla(hue, sat, 60, 0.2 * k));
    ctx.fillStyle = gr; ctx.fill(fill);
    Knobs.neon(ctx, p, hue, sat, Math.max(1.4, h / 70), c.active ? k : 0.2);
    caption(ctx, c.active ? 'WAVE · ' + noteName(c.note) : 'WAVE');
  }

  /* filter: its response, filled under, with the envelope level along the bottom */
  function drawFilter(cv, slot) {
    var g = fit2d(cv); if (!g) return;
    var ctx = g.ctx, w = g.w, h = g.h, c = CH[slot], hue = hueOfSlot(slot), sat = 92, amp = Math.min(1, c.amp), k = 0.5 + 0.5 * amp, mid = h / 2 + 4, i;
    pane(ctx, w, h);
    var cut = sval(slot, 'cutoff'), rs = sval(slot, 'reso'), mode = sval(slot, 'filter_type'), fc = 20 * Math.pow(1000, cut), q = 0.6 + rs * 6;
    var fp = new Path2D(), x0 = 10, x1 = w - 10;
    for (i = 0; i <= 160; i++) {
      var uu = i / 160, fq = 20 * Math.pow(1000, uu), xx = fq / fc, re = 1 - xx * xx, im = xx / q, den = Math.sqrt(re * re + im * im);
      var m = mode < 0.5 ? (1 / den) * (1 - mode * 2) + (xx / q / den) * (mode * 2) : (xx / q / den) * (2 - mode * 2) + (xx * xx / den) * (mode * 2 - 1);
      var db = 20 * Math.log(Math.max(m, 1e-4)) / Math.LN10, yy = mid + h * 0.08 - Math.max(-30, Math.min(15, db)) / 30 * h * 0.4;
      if (i) fp.lineTo(x0 + (x1 - x0) * uu, yy); else fp.moveTo(x0, yy);
    }
    var fq2 = new Path2D(fp); fq2.lineTo(x1, h - 8); fq2.lineTo(x0, h - 8); fq2.closePath();
    var gr = ctx.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, Knobs.hsla(hue, sat, 55, 0.24 * k)); gr.addColorStop(1, Knobs.hsla(hue, sat, 50, 0));
    ctx.fillStyle = gr; ctx.fill(fq2);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(x0 + (x1 - x0) * cut, 20); ctx.lineTo(x0 + (x1 - x0) * cut, h - 10); ctx.stroke(); ctx.setLineDash([]);
    Knobs.neon(ctx, fp, hue, sat, Math.max(1.4, h / 70), k);
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(x0, h - 6, x1 - x0, 2);
    ctx.fillStyle = Knobs.hsla(hue, sat, 65, 0.9); ctx.fillRect(x0, h - 6, (x1 - x0) * amp, 2);
    caption(ctx, 'FILTER · ' + Knobs.fmt('hz', cut, { min: 0, max: 1 }) + ' · ' + Knobs.fmt('type', mode, { min: 0, max: 1 }));
  }

  /* amp: the envelope's shape (segments on a square-root time scale so short and long both read), the level
     it is at now as a line across it, and the pitch envelope's drop, faint, when there is one */
  function drawEnv(cv, slot) {
    var g = fit2d(cv); if (!g) return;
    var ctx = g.ctx, w = g.w, h = g.h, c = CH[slot], hue = hueOfSlot(slot), sat = 92, amp = c.active ? Math.min(1, c.amp) : 0;
    pane(ctx, w, h);
    var a = 0.001 * Math.pow(2, 12 * sval(slot, 'amp_a')), d = 0.005 * Math.pow(2, 9.64 * sval(slot, 'amp_d')), r = 0.005 * Math.pow(2, 9.64 * sval(slot, 'amp_r')), sus = sval(slot, 'amp_s');
    var wa = Math.sqrt(a), wd = Math.sqrt(d), wr = Math.sqrt(r), ws = (wa + wd + wr) * 0.35 + 0.05, tot = wa + wd + ws + wr;
    var x0 = 12, x1 = w - 12, top = 24, bot = h - 10, X = function (t) { return x0 + (x1 - x0) * t / tot; }, Y = function (v) { return bot - (bot - top) * v; };
    var p = new Path2D(); p.moveTo(X(0), Y(0)); p.lineTo(X(wa), Y(1)); p.lineTo(X(wa + wd), Y(sus)); p.lineTo(X(wa + wd + ws), Y(sus)); p.lineTo(X(tot), Y(0));
    var fill = new Path2D(p); fill.closePath();
    var gr = ctx.createLinearGradient(0, top, 0, bot); gr.addColorStop(0, Knobs.hsla(hue, sat, 58, 0.22)); gr.addColorStop(1, Knobs.hsla(hue, sat, 50, 0.02));
    ctx.fillStyle = gr; ctx.fill(fill);
    var pa = sval(slot, 'pitch_amt');
    if (Math.abs(pa) > 0.01) {
      var pd = Math.sqrt(0.005 * Math.pow(2, 7.64 * sval(slot, 'pitch_d'))), pp = new Path2D(), mid = (top + bot) / 2;
      for (var i = 0; i <= 60; i++) { var t = i / 60 * tot, y = mid - pa * (bot - top) * 0.45 * Math.exp(-t / Math.max(0.02, pd)); if (i) pp.lineTo(X(t), y); else pp.moveTo(X(t), y); }
      ctx.save(); ctx.setLineDash([3, 4]); ctx.strokeStyle = 'rgba(239,230,216,0.35)'; ctx.lineWidth = 1; ctx.stroke(pp); ctx.restore();
    }
    if (amp > 0.01) { ctx.fillStyle = Knobs.hsla(hue, sat, 70, 0.5 * amp + 0.2); ctx.fillRect(x0, Y(amp) - 0.5, x1 - x0, 1); }
    Knobs.neon(ctx, p, hue, sat, Math.max(1.4, h / 70), 0.55 + 0.45 * amp);
    caption(ctx, 'ENVELOPE' + (Math.abs(pa) > 0.01 ? ' · PITCH ' + Knobs.fmt('semi', pa) : ''));
  }

  /* drum: the shape of one hit (the envelope, the noise layer shaded, the pitch sweep dashed), from the knobs,
     and a playhead that runs along it after every hit */
  var DRUM_NAMES = ['KICK', 'SNARE', 'HAT', 'OPEN HAT', 'CLAP', 'TOM', 'RIM', 'NOISE'];
  function drumShape(model, d, snap) { // the engine's decay times (DrumVoice.hpp), seconds: [body, noise, pitch sweep]
    switch (model) {
      case 0: return [0.12 + d * d * 1.4, 0.003, 0.03 * (snap > 0.01 ? 1 : 0)];
      case 1: return [0.06 + d * 0.15, 0.08 + d * d * 0.5, 0.02];
      case 2: return [0, 0.012 + d * 0.06, 0];
      case 3: return [0, 0.15 + d * d * 1.2, 0];
      case 4: return [0.08 + d * 0.4, 0.006 + snap * 0.004, 0];
      case 5: return [0.12 + d * d * 0.8, 0.002, 0.06 * (snap > 0.01 ? 1 : 0)];
      case 6: return [0.008 * (1 + 3 * d), 0.004, 0];
      default: return [0, 0.03 + d * d * 1.5, 0];
    }
  }
  function drawDrum(cv, slot) {
    var g = fit2d(cv); if (!g) return;
    var ctx = g.ctx, w = g.w, h = g.h, c = CH[slot], hue = hueOfSlot(slot), sat = 92, i;
    pane(ctx, w, h);
    var model = Math.round(sval(slot, 'drum_model')), sh = drumShape(model, sval(slot, 'drum_decay'), sval(slot, 'drum_snap'));
    var main = Math.max(sh[0], sh[1]), span = Math.min(2, Math.max(0.25, 4.5 * main)), x0 = 10, x1 = w - 10, top = 24, bot = h - 10, N = 160;
    function X(t) { return x0 + (x1 - x0) * t / span; }
    function Y(v) { return bot - (bot - top) * v; }
    function amp(t) {
      if (model === 4) { // clap: three bursts 10 ms apart, then the tail
        var b = t < 0.03 ? Math.exp(-(t % 0.01) / sh[1]) : 0, tail = t >= 0.03 ? 0.7 * Math.exp(-(t - 0.03) / sh[0]) : 0;
        return Math.max(b, tail);
      }
      return Math.max(sh[0] ? Math.exp(-t / sh[0]) : 0, sh[1] ? Math.exp(-t / sh[1]) * (sh[0] ? 0.8 : 1) : 0);
    }
    var p = new Path2D(), nz = new Path2D();
    for (i = 0; i <= N; i++) { var t = span * i / N, y = Y(amp(t)); if (i) p.lineTo(X(t), y); else p.moveTo(X(t), y); }
    if (sh[1] > 0.004 && sh[0] > 0) { // the noise layer under the body
      nz.moveTo(X(0), bot);
      for (i = 0; i <= N; i++) { var tn = span * i / N; nz.lineTo(X(tn), Y(0.8 * Math.exp(-tn / sh[1]))); }
      nz.lineTo(X(span), bot); nz.closePath();
      ctx.fillStyle = 'rgba(239,230,216,0.08)'; ctx.fill(nz);
    }
    var fill = new Path2D(p); fill.lineTo(X(span), bot); fill.lineTo(X(0), bot); fill.closePath();
    var gr = ctx.createLinearGradient(0, top, 0, bot); gr.addColorStop(0, Knobs.hsla(hue, sat, 58, 0.24)); gr.addColorStop(1, Knobs.hsla(hue, sat, 50, 0.02));
    ctx.fillStyle = gr; ctx.fill(fill);
    if (sh[2] > 0) { // the pitch sweep, falling from its start
      var pp = new Path2D(), sw = model === 0 ? 5 * sval(slot, 'drum_snap') : 0.8 * sval(slot, 'drum_snap');
      for (i = 0; i <= N; i++) { var tp = span * i / N, v = (1 + sw * Math.exp(-tp / sh[2])) / (1 + sw); if (i) pp.lineTo(X(tp), Y(v)); else pp.moveTo(X(tp), Y(v)); }
      ctx.save(); ctx.setLineDash([3, 4]); ctx.strokeStyle = 'rgba(239,230,216,0.4)'; ctx.lineWidth = 1; ctx.stroke(pp); ctx.restore();
    }
    Knobs.neon(ctx, p, hue, sat, Math.max(1.4, h / 70), 0.5 + 0.5 * Math.min(1, c.amp * 1.5));
    var last = c.notes.length ? c.notes[c.notes.length - 1].t : -1e9, since = performance.now() / 1000 - last;
    if (since >= 0 && since < span) {
      var px = X(since), a = amp(since);
      ctx.fillStyle = 'rgba(239,230,216,0.35)'; ctx.fillRect(px - 0.5, top, 1, bot - top);
      Knobs.glowDot(ctx, px, Y(a), 4, hue, sat, 0.6 + 0.4 * a);
    }
    caption(ctx, (DRUM_NAMES[model] || 'DRUM') + ' · ' + Math.round(span * 1000) + ' ms');
  }

  /* ---- the effects' views (the curves are the engine's, Fx.hpp) */
  function offNote(ctx, w, h, on) { if (!on) Knobs.text(ctx, 'OFF', w - 12, 12, '500 10px ' + Knobs.MONO, 'rgba(220,220,228,0.4)', 'right'); }

  /* drive: the transfer curve (input across, output up, the straight line faint behind), the level playing now as
     a dot riding it, and the tone's tilt as a short slope along the bottom */
  function drawDriveView(cv, slot) {
    var g = fit2d(cv); if (!g) return;
    var ctx = g.ctx, w = g.w, h = g.h, c = CH[slot], hue = hueOfSlot(slot), sat = 92, i;
    pane(ctx, w, h);
    var amt = sval(slot, 'fx_drive'), tone = sval(slot, 'fx_tone'), on = amt > 0, gn = 1 + 31 * amt * amt, ga = gn * 0.3, mk = Math.sqrt(1 + 0.5 * ga * ga) / gn;
    var cx = w / 2, cy = h / 2 + 6, sx = (w - 40) / 2, sy = (h - 40) / 2, span = 0.6;
    function T(x) { return on ? Math.tanh(gn * x) * mk : x; }
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - sx, cy); ctx.lineTo(cx + sx, cy); ctx.moveTo(cx, cy - sy); ctx.lineTo(cx, cy + sy); ctx.stroke();
    ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(cx - sx, cy + sy); ctx.lineTo(cx + sx, cy - sy); ctx.stroke(); ctx.setLineDash([]);
    var p = new Path2D();
    for (i = 0; i <= 120; i++) { var x = -span + 2 * span * i / 120, y = Math.max(-span, Math.min(span, T(x))); if (i) p.lineTo(cx + sx * x / span, cy - sy * y / span); else p.moveTo(cx + sx * x / span, cy - sy * y / span); }
    Knobs.neon(ctx, p, hue, sat, Math.max(1.4, h / 70), on ? 0.5 + 0.5 * Math.min(1, c.amp) : 0.2);
    if (on && c.active) { // the level now: its peak riding the curve
      var lx = Math.min(span, (c.peak || c.amp * 0.3) * 1.4), ly = Math.max(-span, Math.min(span, T(lx)));
      Knobs.glowDot(ctx, cx + sx * lx / span, cy - sy * ly / span, 4, hue, sat, 0.5 + 0.5 * Math.min(1, c.amp));
    }
    var tx = w - 74, ty = h - 14; // the tilt
    ctx.strokeStyle = on ? Knobs.hsla(hue, 70, 70, 0.7) : 'rgba(255,255,255,0.15)'; ctx.beginPath(); ctx.moveTo(tx, ty + tone * 6); ctx.lineTo(tx + 60, ty - tone * 6); ctx.stroke();
    caption(ctx, 'DRIVE' + (on ? ' · +' + Math.round(20 * Math.log(gn) / Math.LN10) + ' dB · tone ' + Knobs.fmt('bip', tone) : ''));
    offNote(ctx, w, h, on);
  }

  /* chorus: each line's delay sweeping by in time, at its rest (faint): Chorus two lines, left solid and right
     dashed in opposite phase; Ensemble three a side, 120 degrees apart, at staggered rests, with the shimmer on top;
     Vibrato one, both sides together. The scale is the same for all, so depth reads as depth; brighter with more mix.
     The curves are engine/Fx.hpp's (ChorusHz, VibratoHz, ChorusSweep). */
  var CHO_DEV = 0.011486, CHO_SHIMMER = 6.9, CHO_SH_DEPTH = 0.125, ENS_REST = [[-5, -1, 3], [-3, 1, 5]]; // ms from 11: kEnsembleBase, left and right
  function chorusSweep(mode, depth, hz) {
    var w = 2 * Math.PI * hz;
    return mode === 1 ? depth * Math.min(0.003, CHO_DEV / (w * (1 + CHO_SHIMMER * CHO_SH_DEPTH))) : mode === 2 ? depth * 0.004 : depth * Math.min(0.004, CHO_DEV / w);
  }
  function drawChorusView(cv, slot) {
    var g = fit2d(cv); if (!g) return;
    var ctx = g.ctx, w = g.w, h = g.h, hue = hueOfSlot(slot), sat = 92, i, j;
    pane(ctx, w, h);
    var on = chorusOn(slot), mode = Math.round(sval(slot, 'cho_mode')), r = sval(slot, 'cho_rate'), dep = sval(slot, 'cho_depth'), mix = mode === 2 ? 1 : sval(slot, 'cho_mix');
    var hz = mode === 2 ? 0.05 * Math.pow(2, 7 * r) : 0.08 * Math.pow(40, r), sw = chorusSweep(mode, dep, hz) * 1000; // ms
    var x0 = 12, x1 = w - 12, top = 24, bot = h - 10, mid = (top + bot) / 2, secs = Math.max(2 / hz, 0.6);
    var msPx = ((bot - top) / 2 - 4) / 8.5; // +-8.5 ms: Ensemble's outer rests and their sweep
    var lines = mode === 1 ? [0, 1, 2] : [0], sides = mode === 2 ? [1] : [1, -1], k = on ? 0.35 + 0.65 * mix : 0.18;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (j = 0; j < lines.length; j++) [0, 1].forEach(function (side) { ctx.fillRect(x0, mid - (mode === 1 ? ENS_REST[side][j] : 0) * msPx - 0.5, x1 - x0, 1); });
    sides.forEach(function (sg) {
      for (j = 0; j < lines.length; j++) {
        var off = j / 3, rest = mode === 1 ? ENS_REST[sg > 0 ? 0 : 1][j] : 0, p = new Path2D();
        for (i = 0; i <= 160; i++) {
          var u = i / 160, t = T - secs * (1 - u), ph = 2 * Math.PI * (hz * t + off);
          var s = sw * Math.sin(ph) + (mode === 1 ? CHO_SH_DEPTH * sw * Math.sin(2 * Math.PI * (CHO_SHIMMER * hz * t + off)) : 0);
          var x = x0 + (x1 - x0) * u, y = mid - (rest + sg * s) * msPx;
          if (i) p.lineTo(x, y); else p.moveTo(x, y);
        }
        if (sg > 0) Knobs.neon(ctx, p, hue + 12 * j, sat, Math.max(1.2, h / (mode === 1 ? 90 : 70)), k);
        else { ctx.save(); ctx.setLineDash([4, 4]); Knobs.neon(ctx, p, hue + 30 + 12 * j, sat, Math.max(1.1, h / 85), k * 0.8); ctx.restore(); }
      }
    });
    var cents = 1200 * Math.log(1 + 2 * Math.PI * hz * sw / 1000 * (mode === 1 ? 1 + CHO_SHIMMER * CHO_SH_DEPTH : 1)) / Math.LN2;
    var hzs = (hz < 1 ? hz.toFixed(2) : hz.toFixed(1)) + ' Hz';
    caption(ctx, ['CHORUS · 8 ±', 'ENSEMBLE · 3 LINES A SIDE · ±', 'VIBRATO · ±'][mode] + sw.toFixed(1) + ' ms · ' + hzs + ' · ±' + Math.round(cents) + ' ct');
    offNote(ctx, w, h, on);
  }

  /* delay: the echo train on a beat grid: the note, then each echo as tall as it is loud (left above the line,
     right below; ping-pong alternates), darker as the damping takes its top; a playhead runs out from each hit */
  var DLY_BEATS = [0.125, 0.25, 1 / 6, 0.5, 1 / 3, 0.75, 1, 2 / 3, 1.5, 2, 4];
  function drawDelayView(cv, slot) {
    var g = fit2d(cv); if (!g) return;
    var ctx = g.ctx, w = g.w, h = g.h, c = CH[slot], hue = hueOfSlot(slot), sat = 92, i;
    pane(ctx, w, h);
    var mix = sval(slot, 'dly_mix'), on = mix > 0, fb = sval(slot, 'dly_fb'), pp = sval(slot, 'dly_pp') >= 0.5, damp = sval(slot, 'dly_damp');
    var div = DLY_BEATS[Math.round(sval(slot, 'dly_div'))] || 0.5, bpm = F.bpm || gval('tempo'), beats = Math.min(8, Math.max(2, Math.ceil(div * 7)));
    var x0 = 14, x1 = w - 12, top = 24, bot = h - 10, mid = (top + bot) / 2, A = (bot - top) / 2 - 2, X = function (b) { return x0 + (x1 - x0) * b / beats; };
    for (i = 0; i <= beats * 4; i++) { ctx.fillStyle = i % 4 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.1)'; ctx.fillRect(X(i / 4) - 0.5, top, 1, bot - top); }
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(x0, mid - 0.5, x1 - x0, 1);
    var bw = Math.max(3, Math.min(9, (x1 - x0) * div / beats * 0.3));
    function bar(b, amp, side, light) { // side: 1 up (left), -1 down (right), 0 both
      var hh = A * Math.min(1, amp), x = X(b) - bw / 2;
      ctx.fillStyle = Knobs.hsla(hue, sat, light, on ? 0.85 : 0.25);
      if (side >= 0) ctx.fillRect(x, mid - hh, bw, hh);
      if (side <= 0) ctx.fillRect(x, mid, bw, hh);
    }
    bar(0, 1, 0, 80);
    for (var k = 1; on && k * div <= beats + 1e-6 && k < 64; k++) {
      var amp = mix * Math.pow(fb, k - 1), light = 66 - Math.min(40, (k - 1) * damp * 14);
      if (amp < 0.01) break;
      bar(k * div, amp, pp ? (k % 2 ? 1 : -1) : 0, light);
    }
    var last = c.notes.length ? c.notes[c.notes.length - 1].t : -1e9, since = (performance.now() / 1000 - last) * bpm / 60;
    if (on && since >= 0 && since < beats) { ctx.fillStyle = 'rgba(239,230,216,0.45)'; ctx.fillRect(X(since) - 0.5, top, 1, bot - top); }
    caption(ctx, 'DELAY · ' + nameOf(sid(slot, 'dly_div')) + ' · ' + Math.round(Math.min(2, div * 60 / bpm) * 1000) + ' ms' + (pp ? ' · PING-PONG' : ''));
    offNote(ctx, w, h, on);
  }

  /* duck: the duck envelope over the last four seconds (the gain hanging from the top line, dipping on each of
     the source's hits, in the source's color) */
  function drawDuckView(cv, slot) {
    var g = fit2d(cv); if (!g) return;
    var ctx = g.ctx, w = g.w, h = g.h, c = CH[slot], hue = hueOfSlot(slot), sat = 92, i;
    pane(ctx, w, h);
    var src = Math.round(sval(slot, 'duck_src')) - 1, amt = sval(slot, 'duck_amt'), on = ducked(slot);
    var x0 = 12, x1 = w - 12, top = 24, bot = h - 10, H = bot - top, N = c.dkHist.length, sh = on ? hueOfSlot(src) : hue;
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(x0, top, x1 - x0, 1);
    if (on) { ctx.setLineDash([2, 4]); ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(x0, top + H * amt, x1 - x0, 1); ctx.setLineDash([]); }
    var p = new Path2D(); p.moveTo(x0, top);
    for (i = 0; i < N; i++) { var v = c.dkHist[(c.dkPos + i) % N]; p.lineTo(x0 + (x1 - x0) * i / (N - 1), top + H * Math.min(1, v)); }
    var fill = new Path2D(p); fill.lineTo(x1, top); fill.closePath();
    ctx.fillStyle = Knobs.hsla(sh, sat, 55, on ? 0.22 : 0.06); ctx.fill(fill);
    Knobs.neon(ctx, p, sh, sat, Math.max(1.4, h / 70), on ? 0.8 : 0.15);
    caption(ctx, on ? 'DUCK · by ' + slotName(src) + ' · ' + Math.round(amt * 100) + '%' : 'DUCK · off');
  }

  /* the shared reverb: its decay as an envelope after the pre-delay gap (the highs dashed, dying sooner by the
     damping), on a seconds scale, with the reverb's own level now as a line across. In a channel (slot >= 0) the
     same tail in the channel's color, as bright as its send. */
  function drawSpaceView(cv, slot) {
    var g = fit2d(cv); if (!g) return;
    var chan = slot >= 0, ctx = g.ctx, w = g.w, h = g.h, hue = chan ? hueOfSlot(slot) : Knobs.hueOf(F.cr), sat = chan ? 92 : 80, i;
    pane(ctx, w, h);
    var t60 = 0.2 * Math.pow(100, gval('rev_decay')), pre = 0.25 * gval('rev_pre'), dampHz = 18000 * Math.pow(1200 / 18000, gval('rev_damp'));
    var size = 0.4 + 1.2 * gval('rev_size'), ret = chan ? sval(slot, 'rev_send') : gval('rev_return'), span = Math.min(24, Math.max(2, pre + t60 * 1.1));
    var x0 = 12, x1 = w - 12, top = 24, bot = h - 12, X = function (t) { return x0 + (x1 - x0) * t / span; }, Y = function (db) { return top + (bot - top) * Math.min(1, -db / 60); };
    var stepS = span > 8 ? 2 : span > 4 ? 1 : 0.5;
    for (var t = stepS; t < span; t += stepS) { ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(X(t) - 0.5, top, 1, bot - top); Knobs.text(ctx, t + ' s', X(t), bot + 6, '500 8px ' + Knobs.MONO, 'rgba(220,220,228,0.35)', 'center'); }
    var rise = 0.012 * size, hiT60 = t60 * Math.min(1, Math.pow(dampHz / 18000, 0.6)), p = new Path2D(), q = new Path2D();
    for (i = 0; i <= 160; i++) {
      var tt = span * i / 160, a = tt < pre ? -60 : tt < pre + rise ? -60 + 60 * (tt - pre) / rise : -60 * (tt - pre - rise) / t60, b = tt < pre + rise ? a : -60 * (tt - pre - rise) / hiT60;
      if (i) { p.lineTo(X(tt), Y(a)); q.lineTo(X(tt), Y(b)); } else { p.moveTo(X(tt), Y(a)); q.moveTo(X(tt), Y(b)); }
    }
    var fill = new Path2D(p); fill.lineTo(X(span), bot); fill.lineTo(X(0), bot); fill.closePath();
    var gr = ctx.createLinearGradient(0, top, 0, bot); gr.addColorStop(0, Knobs.hsla(hue, sat, 58, 0.18 + 0.2 * ret)); gr.addColorStop(1, Knobs.hsla(hue, sat, 50, 0.02));
    ctx.fillStyle = gr; ctx.fill(fill);
    ctx.save(); ctx.setLineDash([3, 4]); ctx.strokeStyle = 'rgba(239,230,216,0.4)'; ctx.lineWidth = 1; ctx.stroke(q); ctx.restore();
    Knobs.neon(ctx, p, hue, sat, Math.max(1.4, h / 70), 0.45 + 0.55 * ret);
    var t60s = (t60 < 10 ? t60.toFixed(1) : Math.round(t60)) + ' s';
    caption(ctx, chan ? (ret > 0 ? 'REVERB · send ' + Math.round(ret * 100) + '% · ' + t60s : 'REVERB · off') :
      'SPACE · ' + t60s + ' · pre ' + Math.round(pre * 1000) + ' ms · return ' + Math.round(ret * 100) + '%');
  }

  /* master: the output's level over the last four seconds (rms filled, peak as a line) on a dBFS scale with the
     ceiling dashed, and on the right the level now and the glue's and the limiter's gain reduction (hanging down) */
  function drawMasterView(cv) {
    var g = fit2d(cv); if (!g) return;
    var ctx = g.ctx, w = g.w, h = g.h, hue = Knobs.hueOf(F.cr), sat = 80, i, N = MH.rms.length;
    pane(ctx, w, h);
    var x0 = 12, x1 = w - 100, top = 24, bot = h - 14, H = bot - top;
    function Y(lin) { var db = 20 * Math.log(Math.max(lin, 1e-5)) / Math.LN10; return top + H * Math.min(1, Math.max(0, -db / 48)); }
    for (var d = 12; d < 48; d += 12) {
      ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(x0, top + H * d / 48, x1 - x0, 1);
      Knobs.text(ctx, '-' + d, x1 + 4, top + H * d / 48, '500 8px ' + Knobs.MONO, 'rgba(220,220,228,0.35)');
    }
    var cy = Y(Math.pow(10, gval('ceiling') / 20));
    ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(239,230,216,0.45)'; ctx.beginPath(); ctx.moveTo(x0, cy); ctx.lineTo(x1, cy); ctx.stroke(); ctx.restore();
    var pr = new Path2D(), pp = new Path2D();
    pr.moveTo(x0, bot);
    for (i = 0; i < N; i++) {
      var k = (MH.pos + i) % N, x = x0 + (x1 - x0) * i / (N - 1);
      pr.lineTo(x, Y(MH.rms[k]));
      if (i) pp.lineTo(x, Y(MH.peak[k])); else pp.moveTo(x, Y(MH.peak[k]));
    }
    pr.lineTo(x1, bot); pr.closePath();
    var gr = ctx.createLinearGradient(0, top, 0, bot); gr.addColorStop(0, Knobs.hsla(hue, sat, 58, 0.4)); gr.addColorStop(1, Knobs.hsla(hue, sat, 50, 0.04));
    ctx.fillStyle = gr; ctx.fill(pr);
    Knobs.neon(ctx, pp, hue, sat, Math.max(1.2, h / 90), 0.6);
    function bar(x, y0, y1, col, lab) {
      ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(x, top, 12, H);
      ctx.fillStyle = col; ctx.fillRect(x, y0, 12, Math.max(0, y1 - y0));
      Knobs.text(ctx, lab, x + 6, bot + 7, '500 8px ' + Knobs.MONO, 'rgba(220,220,228,0.4)', 'center');
    }
    bar(w - 70, Y(F.mp), bot, Knobs.hsla(hue, sat, 62, 0.85), 'OUT');
    bar(w - 50, top, top + H * Math.min(1, F.gg / 12), 'rgba(255,190,110,0.8)', 'GLUE');
    bar(w - 30, top, top + H * Math.min(1, F.lg / 12), 'rgba(255,110,90,0.85)', 'LIM');
    caption(ctx, 'MASTER · peak ' + (F.mp > 1e-5 ? (20 * Math.log(F.mp) / Math.LN10).toFixed(1) : '-inf') + ' dB · glue -' + F.gg.toFixed(1) + ' · limit -' + F.lg.toFixed(1) + ' dB');
  }

  /* chord: the notes it holds now on a keyboard of two and a half octaves around them, each lit in its note's color */
  var BLACK = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];
  function drawChord(cv, slot) {
    var g = fit2d(cv); if (!g) return;
    var ctx = g.ctx, w = g.w, h = g.h, c = CH[slot], i, n;
    pane(ctx, w, h);
    var notes = c.active ? c.vnotes : [], lo = 1e9, hi = -1e9;
    for (i = 0; i < notes.length; i++) { lo = Math.min(lo, notes[i]); hi = Math.max(hi, notes[i]); }
    if (lo > hi) { lo = 48; hi = 72; }
    var want = Math.round((lo + hi) / 2) - 15;
    // glide to a new register, but never leave a note off the keys
    c.kbLo = c.kbLo == null || lo < c.kbLo + 1 || hi > c.kbLo + 29 ? want : c.kbLo + (want - c.kbLo) * 0.1;
    var first = Math.round(c.kbLo), last = first + 30, whites = [], wIndex = {};
    for (n = first; n <= last; n++) if (!BLACK[((n % 12) + 12) % 12]) { wIndex[n] = whites.length; whites.push(n); }
    var x0 = 10, x1 = w - 10, top = 22, bot = h - 16, ww = (x1 - x0) / whites.length, lit = {}, level = 0.35 + 0.65 * Math.min(1, c.amp);
    for (i = 0; i < notes.length; i++) lit[Math.round(notes[i])] = true;
    function key(x, y, kw, kh, on, hue, off) {
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, kw, kh, 3); else ctx.rect(x, y, kw, kh);
      ctx.fillStyle = on ? Knobs.hsla(hue, 85, 60, 0.88 * level) : off; ctx.fill();
      if (on) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.shadowBlur = 12; ctx.shadowColor = Knobs.hsla(hue, 90, 60, 0.8 * level); ctx.fill(); ctx.restore(); }
    }
    for (i = 0; i < whites.length; i++) {
      var wn = whites[i], wpc = ((wn % 12) + 12) % 12;
      key(x0 + i * ww + 1, top, ww - 2, bot - top, lit[wn], Knobs.hueOf(wpc), 'rgba(255,255,255,0.10)');
      if (wpc === 0) Knobs.text(ctx, 'C' + Math.floor(wn / 12 - 1), x0 + i * ww + ww / 2, bot + 8, '500 9px ' + Knobs.MONO, 'rgba(220,220,228,0.4)', 'center');
    }
    for (n = first + 1; n <= last; n++) {
      var pc = ((n % 12) + 12) % 12; if (!BLACK[pc] || wIndex[n - 1] == null) continue;
      var bw = ww * 0.62, bx = x0 + (wIndex[n - 1] + 1) * ww - bw / 2; // between the white below and the one above
      key(bx, top, bw, (bot - top) * 0.6, lit[n], Knobs.hueOf(pc), '#0c0c0e');
    }
    caption(ctx, (chordArp(slot) ? 'CHORD · ARP' + (sval(slot, 'chord_ring') >= 0.5 ? ' · LET RING' : '') : 'CHORD') + (notes.length ? ' · ' + notes.map(noteName).join(' ') : ''));
  }

  /* pitch: the notes it played in the last four seconds on a roll, the chord's tones as lanes behind */
  var ROLL_S = 4;
  function drawRoll(cv, slot) {
    var g = fit2d(cv); if (!g) return;
    var ctx = g.ctx, w = g.w, h = g.h, c = CH[slot], now = performance.now() / 1000, i, n;
    pane(ctx, w, h);
    var lo = 1e9, hi = -1e9;
    for (i = 0; i < c.notes.length; i++) { lo = Math.min(lo, c.notes[i].n); hi = Math.max(hi, c.notes[i].n); }
    if (lo > hi) { lo = c.note - 6; hi = c.note + 6; }
    var span = Math.max(12, hi - lo + 4), cen = (lo + hi) / 2;
    c.rollLo = c.rollLo == null ? cen - span / 2 : c.rollLo + (cen - span / 2 - c.rollLo) * 0.08;
    c.rollSpan = c.rollSpan == null ? span : c.rollSpan + (span - c.rollSpan) * 0.08;
    var x0 = 10, x1 = w - 10, top = 22, bot = h - 8, Y = function (nn) { return bot - (bot - top) * (nn - c.rollLo) / c.rollSpan; };
    for (n = Math.ceil(c.rollLo); n <= c.rollLo + c.rollSpan; n++) {
      var pc = ((n % 12) + 12) % 12;
      if ((F.cm >> pc) & 1) { ctx.fillStyle = Knobs.hsla(Knobs.hueOf(pc), 70, 50, pc === F.cr ? 0.16 : 0.08); ctx.fillRect(x0, Y(n) - 2, x1 - x0, 4); }
    }
    for (i = 0; i < c.notes.length; i++) {
      var e = c.notes[i], age = now - e.t; if (age > ROLL_S || age < 0) continue;
      var x = x1 - (x1 - x0) * age / ROLL_S, y = Y(e.n), k = 1 - age / ROLL_S, hh = Knobs.hueOf(((e.n % 12) + 12) % 12);
      ctx.fillStyle = Knobs.hsla(hh, 85, 62, 0.25 + 0.6 * k); ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x - 1, y - 2.5, 12, 5, 2.5); else ctx.rect(x - 1, y - 2.5, 12, 5); ctx.fill();
      if (age < 0.25) Knobs.glowDot(ctx, x + 5, y, 4, hh, 92, 1 - age / 0.25);
    }
    caption(ctx, 'NOTES' + (c.active ? ' · ' + noteName(c.note) : ''));
  }

  /* a channel row's view: two cycles of what it plays now, as tall as it is loud */
  function drawScope(cv, slot) {
    var g = fit2d(cv); if (!g) return;
    var ctx = g.ctx, w = g.w, h = g.h, c = CH[slot], hue = hueOfSlot(slot), sat = c.sat, muted = sval(slot, 'mute') >= 0.5, i;
    pane(ctx, w, h);
    var amp = c.active ? Math.min(1, c.amp) : 0, mid = h / 2, x0 = 10, x1 = w - 10, A = h * 0.42, q = new Path2D(), N = 240;
    ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(x0, mid - 0.5, x1 - x0, 1);
    for (i = 0; i <= N; i++) {
      var u = i / N, idx = Math.floor(((u * 2) % 1) * 128) % 128, y = mid - c.wave[idx] * amp * A;
      if (i) q.lineTo(x0 + (x1 - x0) * u, y); else q.moveTo(x0, y);
    }
    var qf = new Path2D(q); qf.lineTo(x1, mid); qf.lineTo(x0, mid); qf.closePath();
    var gr = ctx.createLinearGradient(0, mid - A, 0, mid + A);
    gr.addColorStop(0, Knobs.hsla(hue, sat, 60, 0.22 * amp * (muted ? 0.3 : 1))); gr.addColorStop(0.5, Knobs.hsla(hue, sat, 50, 0.02)); gr.addColorStop(1, Knobs.hsla(hue, sat, 60, 0.22 * amp * (muted ? 0.3 : 1)));
    ctx.fillStyle = gr; ctx.fill(qf);
    Knobs.neon(ctx, q, hue, sat, 1.8, muted ? 0.12 : 0.25 + 0.75 * amp);
  }

  /* a fader in a channel row: level (with the channel's meter under it) or pan (from the centre); the canvas is the
     touch target, the bar drawn across its middle */
  function drawFader(cv) {
    var g = fit2d(cv); if (!g) return;
    var id = +cv.getAttribute('data-id'), d = ORDER[id]; if (!d) return;
    var h = Math.min(g.h, 34); g.ctx.translate(0, (g.h - h) / 2); // a bar 34 high in a target 54 high
    var ctx = g.ctx, w = g.w, spec = specOf(id), c = CH[d.slot], hue = c.hue == null ? 90 : c.hue, sat = c.sat;
    var x = (val(id) - d.min) / (d.max - d.min), from = d.min < 0 ? (0 - d.min) / (d.max - d.min) : 0, hot = drag && drag.cv === cv, near = hot || hover === cv;
    var muted = sval(d.slot, 'mute') >= 0.5, r = 6;
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(0.5, 0.5, w - 1, h - 1, r); else ctx.rect(0.5, 0.5, w - 1, h - 1);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fill(); ctx.strokeStyle = near ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.save(); ctx.clip();
    var a = Math.min(from, x) * w, b = Math.max(from, x) * w;
    ctx.fillStyle = Knobs.hsla(hue, sat, 50, muted ? 0.12 : hot ? 0.42 : 0.3); ctx.fillRect(a, 0, Math.max(1, b - a), h);
    if (d.s === 'level' && c.active && !muted) { ctx.fillStyle = Knobs.hsla(hue, sat, 66, 0.85); ctx.fillRect(0, h - 3, w * x * Math.min(1, c.amp), 3); }
    if (from > 0) { ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(from * w - 0.5, 4, 1, h - 8); }
    ctx.fillStyle = Knobs.hsla(hue, Math.min(sat, 80), 74, muted ? 0.4 : 1); ctx.fillRect(Math.max(0, Math.min(w - 2, x * w - 1)), 0, 2, h);
    ctx.restore();
    // the text: level labelled on the left with its value on the right; pan's value on the side away from its marker
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.95)'; ctx.shadowBlur = 4;
    var col = near ? 'rgba(236,236,240,0.95)' : 'rgba(220,220,228,0.75)';
    if (d.s === 'pan') {
      var pv = val(id), vt = Math.abs(pv) < 0.005 ? 'C' : (pv < 0 ? 'L' : 'R') + Math.round(Math.abs(pv) * 100);
      if (pv < 0) Knobs.text(ctx, vt, w - 7, h / 2, '500 11px ' + Knobs.MONO, col, 'right'); else Knobs.text(ctx, vt, 7, h / 2, '500 11px ' + Knobs.MONO, col);
    } else {
      Knobs.text(ctx, 'LVL', 8, h / 2, '600 10px ' + Knobs.SANS, 'rgba(220,220,228,0.5)');
      Knobs.text(ctx, Knobs.fmt(spec.fmt, val(id), spec), w - 8, h / 2, '500 11px ' + Knobs.MONO, col, 'right');
    }
    ctx.restore();
  }

  /* ------------------------------------------------------------ painting */
  var frames = [], last = 0, lastSize = '';
  function frame(now) {
    var dt = last ? Math.min(0.1, (now - last) / 1000) : 0.016; last = now; T = (now - t0) / 1000;
    frames.push({ t: now, dt: dt * 1000 }); if (frames.length > 1200) frames.shift();
    sampleTelemetry(now, dt);
    // the layout: LAYOUT_H high, as wide as the window, scaled to it
    var S = uiScale(), LW = window.innerWidth / S, LH = window.innerHeight / S, size = LW.toFixed(1) + 'x' + LH.toFixed(1) + '@' + S.toFixed(4);
    if (size !== lastSize) {
      lastSize = size;
      elUI.style.transform = 'scale(' + S + ')'; elUI.style.width = LW + 'px'; elUI.style.height = LH + 'px';
    }
    if (structure) build();
    else if (dirty || now - lastRefresh > 250) refresh();

    if (elToast && toastUntil && now > toastUntil) { elToast.classList.remove('show'); toastUntil = 0; }

    // knobs
    var knobs = document.querySelectorAll('canvas.knob');
    for (var i = 0; i < knobs.length; i++) {
      var cv = knobs[i], id = +cv.getAttribute('data-id'), d = ORDER[id]; if (!d) continue;
      var spec = specOf(id), slot = d.slot, ch = slot >= 0 ? CH[slot] : null;
      var st = { v: val(id), hue: ch && ch.hue != null ? ch.hue : Knobs.hueOf(F.cr), sat: ch ? ch.sat : 70, amp: ch ? Math.min(1, ch.amp) : 0.5,
                 dragging: drag && drag.cv === cv, hover: hover === cv, time: T, beat: F.beat, step: ch ? ch.step : null, len: ch ? ch.len : null,
                 wave: (spec.kind === 'wave' && ch && ch.active) ? ch.wave : null,
                 ch: slot >= 0 ? { cutoff: sval(slot, 'cutoff'), reso: sval(slot, 'reso'), type: sval(slot, 'filter_type') } : null, scale: S };
      if (d.s === 'root') st.hue = Knobs.hueOf(Math.round(st.v));
      Knobs.draw(cv, spec, st);
    }
    document.querySelectorAll('canvas.dot, canvas.bar').forEach(function (dv) {
      var sl = +dv.getAttribute('data-slot'), cc = CH[sl], mutedC = sval(sl, 'mute') >= 0.5 || cc.muted || !cc.active, hh = cc.hue == null ? 90 : cc.hue;
      if (dv.classList.contains('bar')) Knobs.chBar(dv, hh, cc.sat, Math.min(1, cc.amp), mutedC); else Knobs.chDot(dv, hh, cc.sat, Math.min(1, cc.amp), mutedC);
    });
    document.querySelectorAll('[data-note]').forEach(function (el) {
      var sl = +el.getAttribute('data-note'), cc = CH[sl], s2 = cc.active ? Knobs.NOTES[cc.pc] + Math.floor(cc.note / 12 - 1) : '';
      if (el.textContent !== s2) el.textContent = s2;
    });
    var VIEWS = { drumview: drawDrum, chordview: drawChord, scope: drawScope, stepview: drawSteps, rollview: drawRoll, waveview: drawWave, filtview: drawFilter, envview: drawEnv,
                 driveview: drawDriveView, chorusview: drawChorusView, delayview: drawDelayView, duckview: drawDuckView, revview: drawSpaceView, spaceview: drawSpaceView, masterview: drawMasterView };
    for (var vk in VIEWS) document.querySelectorAll('canvas.' + vk).forEach(function (vc) { VIEWS[vk](vc, +vc.getAttribute('data-slot')); });
    document.querySelectorAll('canvas.hfader').forEach(drawFader);
    var wheel = document.querySelector('canvas.wheel'); if (wheel) drawWheel(wheel);
    var pg = document.querySelector('canvas.prog'); if (pg) drawProg(pg);
    if (elStats.style.display === 'block') stats_(now);
    requestAnimationFrame(frame);
  }
  function stats_(now) {
    var n = 0, slow = 0, mx = 0, i;
    for (i = frames.length - 1; i >= 0 && now - frames[i].t <= 10000; i--) { n++; if (frames[i].dt > 20) slow++; if (frames[i].dt > mx) mx = frames[i].dt; }
    var fps = n ? n / Math.min(10, (now - frames[Math.max(0, frames.length - n)].t + 1) / 1000) : 0, tk = 0;
    for (i = stats.tickT.length - 1; i >= 0 && now - stats.tickT[i] <= 10000; i--) tk++;
    elStats.textContent = 'Ammonite Mini #' + (INFO.inst || 0) + '  ' + (INFO.fmt || '') + '  ' + F.sr + ' Hz block ' + F.bl + '  window ' + window.innerWidth + 'x' + window.innerHeight + ' scale ' + uiScale().toFixed(2) + '\n' +
      'page ' + fps.toFixed(0) + ' fps (>20 ms: ' + slow + ', max ' + mx.toFixed(1) + ')  tick ' + stats.tickMs.toFixed(3) + ' ms\n' +
      'telemetry ' + (tk / 10).toFixed(0) + ' pushes/s, ' + (stats.frames / Math.max(1, stats.ticks)).toFixed(1) + ' frames each, smoothing ' + LAT.toFixed(0) + ' ms  host idle ' + F.idleMs.toFixed(1) + ' ms  eval ' + F.evalMs.toFixed(3) + ' ms\n' +
      'beat ' + F.beat.toFixed(2) + '  ' + F.bpm.toFixed(1) + ' BPM ' + (F.playing ? 'playing' : 'stopped') + '  chord ' + chordName() + '  master rms ' + F.mr.toFixed(3);
  }
  /* -------------------------------------------------------------- start */
  requestAnimationFrame(frame);
  send('ready');
})();
