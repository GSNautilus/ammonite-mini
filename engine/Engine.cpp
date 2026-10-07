#include "Engine.hpp"

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <xmmintrin.h>

namespace ammo {

namespace
{
std::atomic<int> gInstances{0};

struct ScopedFlushToZero
{
    unsigned int saved;
    ScopedFlushToZero() : saved(_mm_getcsr()) { _mm_setcsr(saved | 0x8040); }
    ~ScopedFlushToZero() { _mm_setcsr(saved); }
};

inline int   I(float v) { return (int)std::lround(v); }
constexpr float kBusGain = 2.f;
} // namespace

Engine::Engine(double sampleRate, int maxBlock) : instance_(++gInstances)
{
    maxBlock_ = maxBlock > 0 && maxBlock <= kMaxBlock ? maxBlock : kMaxBlock;
    for(int id = 0; id < kNumIds; id++)
        params_[id].store(ParamInfo(id).def, std::memory_order_relaxed);
    ResetToDefaults();
    SetSampleRate(sampleRate);
}

void Engine::SetSampleRate(double sampleRate)
{
    sr_ = sampleRate > 1000.0 ? sampleRate : 48000.0;
    cond_.Init((float)sr_);
    for(int s = 0; s < kSlots; s++)
        ch_[s].Init((float)sr_, s);
    volume_.SetTime(0.02f, (float)sr_, 1);
    volume_.Set(params_[gVolume].load());
    tap_.Init(sr_);
    glue_.Init((float)sr_);
    limiter_.Init((float)sr_);
    volFresh_ = true;
    reverb_.Init((float)sr_);
}

void Engine::ResetToDefaults()
{
    for(int id = 0; id < kNumIds; id++)
        params_[id].store(ParamInfo(id).def, std::memory_order_relaxed);
    for(int i = 0; i < kDefaultPatchSize; i++)
        params_[SlotId(kDefaultPatch[i].slot, kDefaultPatch[i].param)].store(kDefaultPatch[i].value,
                                                                            std::memory_order_relaxed);
}

void Engine::SetParam(int id, float value)
{
    if(id < 0 || id >= kNumIds)
        return;
    if(ParamInfo(id).flags & pfHidden)
        return;
    params_[id].store(ClampParam(id, value), std::memory_order_relaxed);
}

float Engine::GetParam(int id) const
{
    return id >= 0 && id < kNumIds ? params_[id].load(std::memory_order_relaxed) : 0.f;
}

void Engine::Process(float* outL, float* outR, int frames, const HostClock* clock)
{
    ScopedFlushToZero ftz;
    int       done = 0;
    HostClock sub;
    if(clock)
        sub = *clock;
    while(done < frames)
    {
        const int n = frames - done < maxBlock_ ? frames - done : maxBlock_;
        ProcessBlock(outL + done, outR + done, n, clock ? &sub : nullptr);
        if(clock && sub.playing)
            sub.beat += sub.bpm / 60.0 / sr_ * (double)n;
        done += n;
    }
}

void Engine::ProcessBlock(float* outL, float* outR, int n, const HostClock* clock)
{
    std::memset(outL, 0, sizeof(float) * n);
    std::memset(outR, 0, sizeof(float) * n);

    // the conductor: this block's clock and harmony
    ConductorParams cp;
    cp.tempo   = params_[gTempo].load();
    cp.sync    = I(params_[gSync].load());
    cp.swing   = params_[gSwing].load();
    cp.root    = I(params_[gRoot].load());
    cp.scale   = I(params_[gScale].load());
    cp.prog    = I(params_[gProg].load());
    cp.change  = I(params_[gChange].load());
    cp.chord   = I(params_[gChord].load());
    cp.restart = I(params_[gRestart].load());
    cp.octave  = I(params_[gOctave].load());
    BlockClock clk;
    cond_.Begin(cp, clock, n, clk);

    AmmoFrame& f = tele_.beginWrite();
    int        duckFrom[kSlots];
    for(int s = 0; s < kSlots; s++)
    {
        ChannelParams p;
        const auto    v = [&](int param) { return params_[SlotId(s, param)].load(std::memory_order_relaxed); };
        p.gen           = I(v(cGen));
        p.inst          = I(v(cInst));
        p.level         = v(cLevel);
        p.pan           = v(cPan);
        p.mute          = v(cMute) >= 0.5f;
        p.show          = v(cShow) >= 0.5f;
        p.arp.degree    = I(v(cDegree));
        p.arp.octave    = I(v(cOctave));
        p.arp.mode      = I(v(cArpMode));
        p.arp.pool      = I(v(cArpPool));
        p.arp.range     = I(v(cArpRange));
        p.arp.div       = I(v(cArpDiv));
        p.arp.length    = I(v(cArpLength));
        p.arp.gate      = v(cArpGate);
        p.arp.density   = v(cArpDensity);
        p.arp.vary      = v(cArpVary);
        p.arp.ratchet   = v(cArpRatchet);
        VoiceParams& vp = p.voice;
        vp.shape        = v(cShape);
        vp.detuneCents  = v(cDetune);
        vp.sub          = v(cSub);
        vp.noise        = v(cNoise);
        vp.cutoff       = v(cCutoff);
        vp.reso         = v(cReso);
        vp.filterType   = v(cFilterType);
        vp.drive        = v(cDrive);
        vp.ampA         = v(cAmpAttack);
        vp.ampD         = v(cAmpDecay);
        vp.ampS         = v(cAmpSustain);
        vp.ampR         = v(cAmpRelease);
        vp.filtAmount   = v(cFiltEnvAmount);
        vp.filtA        = v(cFiltAttack);
        vp.filtD        = v(cFiltDecay);
        vp.pitchAmount  = v(cPitchEnvAmount);
        vp.pitchD       = v(cPitchDecay);
        vp.glide        = v(cGlide);
        p.chord.notes   = I(v(cChordNotes));
        p.chord.voicing = I(v(cChordVoicing));
        p.chord.smooth  = I(v(cChordLead)) == 1;
        p.chord.rhythm  = I(v(cChordRhythm));
        p.chord.strum   = v(cChordStrum);
        p.chord.letRing = v(cChordLetRing) >= 0.5f;
        p.bassPattern   = I(v(cBassPattern));
        p.rhythm.rotate = I(v(cRhythmRotate));
        p.rhythm.chance = v(cRhythmChance);
        p.rhythm.pitch  = I(v(cRhythmPitch));
        p.drum.model    = I(v(cDrumModel));
        p.drum.tune     = v(cDrumTune);
        p.drum.decay    = v(cDrumDecay);
        p.drum.tone     = v(cDrumTone);
        p.drum.snap     = v(cDrumSnap);
        FxParams& fx       = p.fx;
        fx.drive           = v(cFxDrive);
        fx.tone            = v(cFxTone);
        fx.chorusOn        = v(cChorusOn) >= 0.5f;
        fx.chorusMode      = I(v(cChorusMode));
        fx.chorusRate      = v(cChorusRate);
        fx.chorusDepth     = v(cChorusDepth);
        fx.chorusMix       = v(cChorusMix);
        fx.delayDiv        = I(v(cDelayDiv));
        fx.delayFb         = v(cDelayFeedback);
        fx.delayPingPong   = v(cDelayPingPong) >= 0.5f;
        fx.delayDamp       = v(cDelayDamping);
        fx.delayMix        = v(cDelayMix);
        fx.revSend         = v(cRevSend);
        fx.duckSrc         = I(v(cDuckSource));
        fx.duckAmt         = v(cDuckAmount);
        ch_[s].SetParams(p);
        duckFrom[s] = fx.duckSrc - 1 != s && fx.duckAmt > 0.f ? fx.duckSrc - 1 : -1; // a slot does not duck itself
    }

    // every channel's voices first (a ducked channel needs its source's envelope for this block), then the strips
    for(int s = 0; s < kSlots; s++)
    {
        bool want = false;
        for(int t = 0; t < kSlots && !want; t++)
            want = duckFrom[t] == s;
        ch_[s].SetWantEnv(want);
        ch_[s].Render(cond_, n, f.ch[s]);
    }
    std::memset(revL_, 0, sizeof(float) * (size_t)n);
    std::memset(revR_, 0, sizeof(float) * (size_t)n);
    for(int s = 0; s < kSlots; s++)
        ch_[s].Mix(cond_, outL, outR, revL_, revR_, n, duckFrom[s] >= 0 ? ch_[duckFrom[s]].Env() : nullptr, f.ch[s]);

    // the shared reverb, on the sends (fed: something was sent; else it runs only while its tail rings)
    bool fed = false;
    for(int i = 0; i < n && !fed; i++)
        fed = revL_[i] != 0.f || revR_[i] != 0.f;
    ReverbParams rp;
    rp.size  = params_[gRevSize].load();
    rp.decay = params_[gRevDecay].load();
    rp.damp  = params_[gRevDamping].load();
    rp.pre   = params_[gRevPreDelay].load();
    rp.width = params_[gRevWidth].load();
    rp.ret   = params_[gRevReturn].load();
    reverb_.Process(revL_, revR_, outL, outR, n, rp, fed);

    MasterBus(outL, outR, n, f);
    tap_.Write(outL, outR, n);

    // the frame
    f.seq         = ++seq_;
    f.beat        = clk.lastBeat();
    f.bpm         = clk.bpm;
    f.playing     = clk.playing ? 1 : 0;
    f.hostClock   = cond_.hasHostClock() ? 1 : 0;
    f.chordRootPc = (cp.root + cond_.harmony().chordRootSemis) % 12;
    f.chordDeg    = cond_.chordNow() % 7;
    f.chordQuality = cond_.harmony().Quality();
    f.progPos     = cond_.progPos();
    f.progLen     = cond_.progLen();
    cond_.harmony().Masks(cp.root, f.keyMask, f.chordMask);
    f.instance    = instance_;
    f.sampleRate  = sr_;
    f.block       = (uint32_t)n;
    tele_.publish();
}

void Engine::MasterBus(float* outL, float* outR, int n, AmmoFrame& f)
{
    // +6 dB into the bus (the voices sum low: 0.3 each, sized for the soft clip this bus had before the limiter), GLUE,
    // the limiter, then the volume (so the ceiling holds at any volume)
    for(int i = 0; i < n; i++)
    {
        outL[i] *= kBusGain;
        outR[i] *= kBusGain;
    }
    f.glueGr  = glue_.Process(outL, outR, n, params_[gGlue].load());
    f.limitGr = limiter_.Process(outL, outR, n, params_[gCeiling].load());
    const float vt = params_[gVolume].load();
    if(volFresh_)
    {
        volume_.Set(vt); // the first block starts on the value, no glide from the table default
        volFresh_ = false;
    }
    volume_.Target(vt);
    double sumSq = 0.0;
    float  peak  = 0.f;
    for(int i = 0; i < n; i++)
    {
        const float vol = volume_.Next();
        const float l   = outL[i] * vol;
        const float r   = outR[i] * vol;
        outL[i]         = l;
        outR[i]         = r;
        sumSq += 0.5 * ((double)l * l + (double)r * r);
        const float m = std::fmax(l < 0.f ? -l : l, r < 0.f ? -r : r);
        if(m > peak)
            peak = m;
    }
    f.masterRms  = (float)std::sqrt(sumSq / (n > 0 ? n : 1));
    f.masterPeak = peak;
}

std::string Engine::Save() const
{
    std::string out = "ammonite-desktop 2\n"; // 2: the arp divisions gained 4/1 2/1 and the dotted ones
    char        line[64];
    for(int id = 0; id < kNumIds; id++)
    {
        const ParamDef& d = ParamInfo(id);
        if(d.flags & pfHidden)
            continue;
        const float v = params_[id].load(std::memory_order_relaxed);
        if(std::fabs(v - d.def) < 1e-7f)
            continue;
        std::snprintf(line, sizeof line, "%d %.7g\n", id, (double)v);
        out += line;
    }
    return out;
}

bool Engine::Load(const char* text, size_t len)
{
    float values[kNumIds];
    if(!ParseState(text, len, values))
        return false;
    for(int id = 0; id < kNumIds; id++)
        params_[id].store(values[id], std::memory_order_relaxed);
    return true;
}

bool Engine::ParseState(const char* text, size_t len, float* values)
{
    if(text == nullptr || len < 18 || std::strncmp(text, "ammonite-desktop ", 17) != 0)
        return false;
    // defaults first (table defaults, not the patch: the chunk holds every
    // non-default value, so a saved default patch restores itself)
    for(int id = 0; id < kNumIds; id++)
        values[id] = ParamInfo(id).def;
    const char* p       = text;
    const char* end     = text + len;
    const int   version = std::atoi(text + 17);
    // skip the header line
    while(p < end && *p != '\n')
        p++;
    while(p < end)
    {
        char* next = nullptr;
        const long id = std::strtol(p, &next, 10);
        if(next == p)
        {
            while(p < end && *p != '\n')
                p++;
            if(p < end)
                p++;
            continue;
        }
        float v = std::strtof(next, &next);
        int   slot, sp;
        if(version < 2 && IsSlotId((int)id, slot, sp) && sp == cArpDiv)
            v = (float)kArpDivFromV1[(int)std::lround(std::fmin(std::fmax(v, 0.f), 8.f))];
        if(id >= 0 && id < kNumIds && !(ParamInfo((int)id).flags & pfHidden))
            values[id] = ClampParam((int)id, v);
        p = next;
        while(p < end && *p != '\n')
            p++;
        if(p < end)
            p++;
    }
    return true;
}

} // namespace ammo
