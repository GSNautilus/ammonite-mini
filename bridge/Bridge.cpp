/** Ammonite Mini's bridge (Bridge.hpp): desktop's AmmoniteUI.cpp message handling and ticks, without the window,
 *  the dialogs or the plugin host. The JavaScript it builds is desktop's, but for ammo.info's fields and the
 *  ticks: `p` is the bridge's transport, and many small blocks are folded into at most six frames (Tick), with
 *  `cpk` beside `cpu` for the worst block folded. */
#include "Bridge.hpp"

#include "Presets.hpp"

#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <vector>

namespace ammo {

namespace
{
double NowMs() { return std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now().time_since_epoch()).count(); }

std::string Base64(const unsigned char* data, size_t len)
{
    static const char* const T = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    std::string              out;
    out.reserve((len + 2) / 3 * 4);
    for(size_t i = 0; i < len; i += 3)
    {
        const unsigned v = (unsigned)data[i] << 16 | (i + 1 < len ? (unsigned)data[i + 1] << 8 : 0u)
                           | (i + 2 < len ? (unsigned)data[i + 2] : 0u);
        out.push_back(T[(v >> 18) & 63]);
        out.push_back(T[(v >> 12) & 63]);
        out.push_back(i + 1 < len ? T[(v >> 6) & 63] : '=');
        out.push_back(i + 2 < len ? T[v & 63] : '=');
    }
    return out;
}

void Num(std::string& s, double v, const char* fmt = "%.4g")
{
    char b[32];
    std::snprintf(b, sizeof b, fmt, v);
    s += b;
}

void Str(std::string& s, const char* t)
{
    s += '"';
    for(; *t; t++)
    {
        if((unsigned char)*t < 0x20)
        {
            char u[8];
            std::snprintf(u, sizeof u, "\\u%04x", (unsigned)*t);
            s += u;
            continue;
        }
        if(*t == '"' || *t == '\\')
            s += '\\';
        s += *t;
    }
    s += '"';
}

/** A name that is safe as a file name. */
std::string FileSafe(std::string s)
{
    for(char& c : s)
        if((unsigned char)c < 32 || std::strchr("\\/:*?\"<>|", c) != nullptr)
            c = '-';
    return s;
}

/** The text after "page " on its own line, or empty. */
std::string PageLine(const std::string& text)
{
    size_t at = 0;
    while(at < text.size())
    {
        size_t end = text.find('\n', at);
        if(end == std::string::npos)
            end = text.size();
        if(text.compare(at, 5, "page ") == 0)
        {
            size_t e = end;
            while(e > at + 5 && (text[e - 1] == '\r' || text[e - 1] == ' '))
                e--;
            return text.substr(at + 5, e - at - 5);
        }
        at = end + 1;
    }
    return std::string();
}
} // namespace

Bridge::Bridge(Engine& engine, const AmmoBridgeHost& host, const std::string& recordDir)
: engine_(engine), host_(host), recordDir_(recordDir)
{
}

Bridge::~Bridge() { StopRecording(false); } // a recording lives with the bridge: closing it ends the file properly

void Bridge::Eval(const std::string& js)
{
    if(host_.eval == nullptr)
        return;
    const double t0 = NowMs();
    host_.eval(host_.user, js.c_str());
    lastEvalMs_ = NowMs() - t0;
}

void Bridge::Log(const std::string& line)
{
    if(host_.log != nullptr)
        host_.log(host_.user, line.c_str());
}

void Bridge::SetPlaying(bool on)
{
    if(playing_.exchange(on, std::memory_order_relaxed) != on)
        told_ = false; // the page hears of it with the next tick, even if no frame comes (stopped, none will)
}

/* ---- page -> bridge */
void Bridge::OnMessage(const char* msg)
{
    if(std::strcmp(msg, "ready") == 0)
    {
        ready_ = true;
        Log("page ready");
        SendParams();
        SendValues();
        SendPresets();
        if(wav_.IsOpen()) // the page reloaded while recording
        {
            std::string rj = "ammo.rec({on:1,secs:";
            Num(rj, (double)wav_.Frames() / recRate_, "%.2f");
            Eval(rj + "})");
        }
        std::string js = "ammo.info({fmt:\"android\",inst:";
        Num(js, engine_.instance(), "%.0f");
        js += "})";
        Eval(js);
        return;
    }
    if(std::strncmp(msg, "set ", 4) == 0)
    {
        int   id = -1;
        float v  = 0.f;
        // a host parameter or a route (not a host's on desktop, where the plugin's state follows the routes; here
        // the engine's patch text carries them)
        if(std::sscanf(msg + 4, "%d %f", &id, &v) == 2 && (VisibleIndexOf(id) >= 0 || IsRouteId(id)))
            engine_.SetParam(id, ClampParam(id, v));
        return;
    }
    if(std::strncmp(msg, "edit ", 5) == 0) // a gesture's start and end: for a plugin host's undo; none here
        return;
    if(std::strncmp(msg, "preset ", 7) == 0)
    {
        const int k = std::atoi(msg + 7);
        if(k >= 0 && k < kNumPresets)
        {
            std::vector<float> values(kNumIds);
            for(int id = 0; id < kNumIds; id++)
                values[id] = PresetValue(k, id);
            ApplyValues(values.data());
            preset_ = k;
            file_.clear();
            SendPresets();
            Log("preset " + std::to_string(k) + " applied");
        }
        return;
    }
    if(std::strncmp(msg, "save ", 5) == 0 || std::strcmp(msg, "save") == 0)
    {
        pageJson_ = msg[4] == ' ' ? msg + 5 : "";
        for(char& c : pageJson_)
            if(c == '\n' || c == '\r')
                c = ' ';
        if(host_.pick != nullptr)
            host_.pick(host_.user, 1, (FileSafe(PatchName()) + ".ammo").c_str());
        return;
    }
    if(std::strcmp(msg, "open") == 0)
    {
        if(host_.pick != nullptr)
            host_.pick(host_.user, 0, "");
        return;
    }
    if(std::strncmp(msg, "record ", 7) == 0)
    {
        if(std::atoi(msg + 7) != 0)
            StartRecording();
        else
            StopRecording(true);
        return;
    }
    if(std::strncmp(msg, "key ", 4) == 0)
    {
        // no host to forward keys to: Space (on its way down, not its repeats) is play / stop
        int down = 0, vk = 0, repeat = 0;
        if(std::sscanf(msg + 4, "%d %d %d", &down, &vk, &repeat) >= 2 && vk == 32 && down != 0 && repeat == 0)
            SetPlaying(!Playing());
        return;
    }
    if(std::strncmp(msg, "log ", 4) == 0 || std::strncmp(msg, "gl ", 3) == 0)
    {
        Log(msg);
        return;
    }
    // the output device is desktop's standalone host's: Android routes the audio itself, so the page never hears
    // of one (no ammo.outputs) and should not ask; quiet if it does
    if(std::strcmp(msg, "outputs") == 0 || std::strcmp(msg, "output") == 0 || std::strncmp(msg, "output ", 7) == 0)
        return;
    Log(std::string("page said: ") + msg);
}

/* ---- bridge -> page */
/** The parameter table: id, name, symbol, slot (-1 global or the pool), min, max, def, steps, flags, names;
 *  every saved parameter (desktop's host parameters, and the routes). Once, at ready. */
void Bridge::SendParams()
{
    std::string js;
    js.reserve(160000);
    js += "ammo.params([";
    bool first = true;
    for(int id = 0; id < kNumIds; id++)
    {
        if(!IsSaved(id))
            continue;
        const ParamDef& d = ParamInfo(id);
        int             slot = -1, sp = 0;
        IsSlotId(id, slot, sp);
        js += first ? "{id:" : ",{id:";
        first = false;
        Num(js, id, "%.0f");
        js += ",n:";
        Str(js, d.name);
        js += ",s:";
        Str(js, d.symbol);
        js += ",slot:";
        Num(js, slot, "%.0f");
        js += ",min:";
        Num(js, d.min, "%.6g");
        js += ",max:";
        Num(js, d.max, "%.6g");
        js += ",def:";
        Num(js, d.def, "%.6g");
        js += ",steps:";
        Num(js, d.steps, "%.0f");
        js += ",flags:";
        Num(js, d.flags, "%.0f");
        if(d.steps > 0 && d.names != nullptr)
        {
            js += ",names:[";
            for(int k = 0; k < d.steps; k++)
            {
                if(k)
                    js += ",";
                Str(js, d.names[k]);
            }
            js += "]";
        }
        js += "}";
    }
    js += "])";
    Eval(js);
}

/** Every saved value to the page: the engine's, or `byId` (values just set, which the engine takes in only at
 *  its next block). */
void Bridge::SendValues(const float* byId)
{
    std::string js = "ammo.values([";
    bool        first = true;
    for(int id = 0; id < kNumIds; id++)
    {
        if(!IsSaved(id))
            continue;
        js += first ? "[" : ",[";
        first = false;
        Num(js, id, "%.0f");
        js += ",";
        Num(js, byId ? byId[id] : engine_.GetParam(id), "%.6g");
        js += "]";
    }
    js += "])";
    Eval(js);
}

/** A whole patch (a value per id, the routes too) into the engine and the page. */
void Bridge::ApplyValues(const float* byId)
{
    for(int id = 0; id < kNumIds; id++)
        if(IsSaved(id))
            engine_.SetParam(id, byId[id]);
    SendValues(byId);
}

/** The preset list, the current one (-1: a patch file) and the file's name. */
void Bridge::SendPresets()
{
    std::string js = "ammo.presets([";
    for(int k = 0; k < kNumPresets; k++)
    {
        js += k ? ",{n:" : "{n:";
        Str(js, kPresets[k].name);
        js += ",b:";
        Str(js, kPresets[k].blurb);
        js += "}";
    }
    js += "],";
    Num(js, preset_, "%.0f");
    js += ",";
    Str(js, file_.c_str());
    js += ")";
    Eval(js);
}

void Bridge::Toast(const std::string& text)
{
    std::string js = "ammo.toast(";
    Str(js, text.c_str());
    js += ")";
    Eval(js);
}

/** What the patch is called now: the file's name, or the preset's. */
std::string Bridge::PatchName() const
{
    if(!file_.empty())
        return file_;
    if(preset_ >= 0 && preset_ < kNumPresets)
        return kPresets[preset_].name;
    return "Untitled";
}

/* ---- patch files */
std::string Bridge::PatchText() const
{
    std::string text = engine_.Save();
    if(!pageJson_.empty())
        text += "page " + pageJson_ + "\n";
    return text;
}

void Bridge::Saved(const std::string& name, bool ok)
{
    if(name.empty())
        return; // the picker was cancelled
    if(!ok)
    {
        Toast("Could not write " + name);
        return;
    }
    const size_t dot = name.find_last_of('.');
    file_            = dot == std::string::npos || dot == 0 ? name : name.substr(0, dot);
    SendPresets();
    Toast("Saved " + name);
    Log("patch saved: " + name);
}

void Bridge::Opened(const std::string& name, const char* text, size_t len)
{
    std::vector<float> values(kNumIds);
    if(text == nullptr || !Engine::ParseState(text, len, values.data()))
    {
        Toast("Not an Ammonite patch: " + name);
        return;
    }
    ApplyValues(values.data());
    const std::string page = PageLine(std::string(text, len));
    if(!page.empty())
    {
        std::string js = "ammo.page(";
        Str(js, page.c_str());
        js += ")";
        Eval(js);
    }
    const size_t dot = name.find_last_of('.');
    preset_          = -1;
    file_            = dot == std::string::npos || dot == 0 ? name : name.substr(0, dot);
    SendPresets();
    Toast("Opened " + name);
    Log("patch opened: " + name);
}

/* ---- recording */
void Bridge::StartRecording()
{
    if(wav_.IsOpen())
        return;
    const std::time_t now = std::time(nullptr);
    std::tm           t{};
#ifdef _WIN32
    localtime_s(&t, &now);
#else
    localtime_r(&now, &t);
#endif
    char stamp[64];
    std::strftime(stamp, sizeof stamp, "Ammonite %Y-%m-%d %H-%M-%S ", &t);
    recPath_ = recordDir_ + "/" + FileSafe(stamp + PatchName()) + ".wav";
    if(recordDir_.empty() || !wav_.Open(std::fopen(recPath_.c_str(), "wb"), (int)std::lround(engine_.SampleRate())))
    {
        Eval("ammo.rec({on:0})");
        Toast("Could not record to " + recPath_);
        return;
    }
    recRate_ = engine_.SampleRate();
    engine_.recordTap().Start();
    Eval("ammo.rec({on:1})");
    Log("recording " + recPath_);
}

void Bridge::StopRecording(bool tell)
{
    if(!wav_.IsOpen())
        return;
    RecordTap& tap = engine_.recordTap();
    tap.Stop();
    DrainTap(tap, wav_);
    const double   secs    = (double)wav_.Frames() / (recRate_ > 0 ? recRate_ : 48000.0);
    const uint32_t dropped = tap.Dropped();
    const bool     ok      = wav_.Close();
    char           line[96];
    std::snprintf(line, sizeof line, "recording stopped: %.2f s, %u frames dropped, %s", secs, dropped, ok ? "ok" : "write failed");
    Log(line);
    if(host_.recorded != nullptr)
        host_.recorded(host_.user, recPath_.c_str(), ok ? 1 : 0);
    if(!tell)
        return;
    std::string js = "ammo.rec({on:0,secs:";
    Num(js, secs, "%.2f");
    js += ",dropped:";
    Num(js, dropped, "%.0f");
    js += ",ok:";
    js += ok ? "1" : "0";
    js += ",path:";
    Str(js, recPath_.c_str());
    js += "})";
    Eval(js);
}

/* ---- ticks */
/** Every frame waiting is read; at most kSend go to the page. On the tablet a block is a 96-frame burst, 500
 *  frames a second, more than desktop's six a tick could carry: the frames left out are folded into the one sent
 *  after them (its block count covers them, a hit in any of them is its hit, the duck their deepest), so the
 *  page's timing and note history stay whole. Only the last frame carries the waves (the page keeps a channel's
 *  wave until one comes), which keeps a tick's JavaScript small. A frame sent carries its blocks' CPU load as the
 *  mean weighted by their lengths (`cpu`: the page weighs frames the same way) and the worst of them (`cpk`); its
 *  LFOs and routes are its last block's, as each of desktop's frames has them. */
void Bridge::Tick()
{
    if(wav_.IsOpen())
        DrainTap(engine_.recordTap(), wav_);
    uint32_t got = 0;
    while(got < kRead && engine_.telemetry().read(read_[got]))
        got++;
    if(got == 0 && ready_ && !told_ && haveLast_) // the transport changed, nothing new: the last frame again, as news
    {
        read_[0] = last_;
        read_[0].seq++;
        read_[0].block = 0;
        got = 1;
    }
    if(!ready_ || got == 0)
        return;
    last_     = read_[got - 1];
    haveLast_ = true;
    told_     = true;
    AmmoFrame* const frames = send_;
    const uint32_t   n      = got < kSend ? got : kSend;
    for(uint32_t j = 0, from = 0; j < n; j++)
    {
        const uint32_t to = (uint32_t)(((uint64_t)(j + 1) * got) / n) - 1; // the frames [from, to] fold into `to`
        AmmoFrame&     f  = frames[j];
        f                 = read_[to];
        double busy       = (double)f.cpu * f.block;
        cpuPeak_[j]       = f.cpu;
        for(uint32_t k = from; k < to; k++)
        {
            const AmmoFrame& e = read_[k];
            f.block += e.block;
            busy += (double)e.cpu * e.block;
            if(e.cpu > cpuPeak_[j])
                cpuPeak_[j] = e.cpu;
            for(int s = 0; s < AMMO_SLOTS; s++)
            {
                AmmoChannelFrame&       c = f.ch[s];
                const AmmoChannelFrame& d = e.ch[s];
                if(d.duck > c.duck)
                    c.duck = d.duck;
            }
        }
        // a hit left out: the frame sent has it, with that note (the latest of them, when it has none of its own)
        for(int s = 0; s < AMMO_SLOTS; s++)
        {
            AmmoChannelFrame& c = f.ch[s];
            for(uint32_t k = to; k-- > from && !c.hit;)
            {
                const AmmoChannelFrame& d = read_[k].ch[s];
                if(d.hit)
                {
                    c.hit        = 1;
                    c.note       = d.note;
                    c.pitchClass = d.pitchClass;
                    c.hitSeed    = d.hitSeed;
                }
            }
        }
        if(f.block > 0)
            f.cpu = (float)(busy / f.block);
        from = to + 1;
    }

    const bool    playing = Playing();
    std::string   js;
    js.reserve(4096 * n);
    js += "ammo.tick([";
    unsigned char bytes[AMMO_WAVE_LEN];
    for(uint32_t i = 0; i < n; i++)
    {
        const AmmoFrame& f = frames[i];
        js += i ? ",{s:" : "{s:";
        Num(js, f.seq, "%.0f");
        js += ",b:";
        Num(js, f.beat, "%.4f");
        js += ",t:";
        Num(js, f.bpm, "%.2f");
        js += playing ? ",p:1" : ",p:0";
        js += f.hostClock ? ",h:1" : ",h:0";
        js += ",cr:";
        Num(js, f.chordRootPc, "%.0f");
        js += ",cd:";
        Num(js, f.chordDeg, "%.0f");
        js += ",cq:";
        Num(js, f.chordQuality, "%.0f");
        js += ",pp:";
        Num(js, f.progPos, "%.0f");
        js += ",pl:";
        Num(js, f.progLen, "%.0f");
        js += ",km:";
        Num(js, f.keyMask, "%.0f");
        js += ",cm:";
        Num(js, f.chordMask, "%.0f");
        js += ",sr:";
        Num(js, f.sampleRate, "%.0f");
        js += ",bl:";
        Num(js, f.block, "%.0f");
        js += ",mr:";
        Num(js, f.masterRms);
        js += ",mp:";
        Num(js, f.masterPeak);
        js += ",gg:";
        Num(js, f.glueGr, "%.2f");
        js += ",lg:";
        Num(js, f.limitGr, "%.2f");
        // the modulation pool: the LFOs that ran ({index: value}), the live routes' target positions ({route: 0..1})
        js += ",lf:{";
        bool firstL = true;
        for(int l = 0; l < AMMO_LFOS; l++)
        {
            if(!(f.lfoRun >> l & 1u))
                continue;
            js += firstL ? "\"" : ",\"";
            firstL = false;
            Num(js, l, "%.0f");
            js += "\":";
            Num(js, f.lfo[l], "%.3f");
        }
        js += "},rt:{";
        bool firstR = true;
        for(int r = 0; r < AMMO_ROUTES; r++)
        {
            if(f.route[r] < 0.f)
                continue;
            js += firstR ? "\"" : ",\"";
            firstR = false;
            Num(js, r, "%.0f");
            js += "\":";
            Num(js, f.route[r], "%.4f");
        }
        js += "},cpu:";
        Num(js, f.cpu, "%.4f");
        js += ",cpk:";
        Num(js, cpuPeak_[i], "%.4f");
        js += ",ch:{";
        bool firstCh = true;
        for(int s = 0; s < AMMO_SLOTS; s++)
        {
            const AmmoChannelFrame& c = f.ch[s];
            if(!c.active && c.env <= 0.f)
                continue;
            if(!firstCh)
                js += ",";
            firstCh = false;
            js += "\"";
            Num(js, s, "%.0f");
            js += "\":{a:";
            js += c.active ? "1" : "0";
            if(c.muted)
                js += ",m:1";
            js += ",n:";
            Num(js, c.note, "%.2f");
            js += ",pc:";
            Num(js, c.pitchClass, "%.0f");
            js += ",e:";
            Num(js, c.env, "%.4f");
            js += ",r:";
            Num(js, c.rms);
            js += ",k:";
            Num(js, c.peak);
            js += c.hit ? ",h:1" : ",h:0";
            js += ",sd:";
            Num(js, c.hitSeed, "%.0f");
            js += ",st:";
            Num(js, c.step, "%.0f");
            js += ",ln:";
            Num(js, c.length, "%.0f");
            js += ",v:[";
            for(int k = 0; k < c.voices && k < AMMO_POLY; k++)
            {
                if(k)
                    js += ",";
                Num(js, c.voiceNote[k], "%.2f");
            }
            js += "]";
            if(c.duck > 0.f)
            {
                js += ",dk:";
                Num(js, c.duck, "%.3f");
            }
            if(i + 1 < n) // the waves: the last frame's only
            {
                js += "}";
                continue;
            }
            float peak = 0.f;
            for(int k = 0; k < AMMO_WAVE_LEN; k++)
                peak = std::fmax(peak, std::fabs(c.wave[k]));
            for(int k = 0; k < AMMO_WAVE_LEN; k++)
            {
                const int q = peak > 0.f ? (int)std::lround(c.wave[k] / peak * 127.f) : 0;
                bytes[k]    = (unsigned char)(q < 0 ? q + 256 : q);
            }
            js += ",ws:";
            Num(js, peak);
            js += ",w:\"";
            js += Base64(bytes, AMMO_WAVE_LEN);
            js += "\"}";
        }
        js += "}}";
    }
    js += "],{idleMs:0,evalMs:";
    Num(js, lastEvalMs_, "%.3f");
    js += "})";
    Eval(js);
}

} // namespace ammo
