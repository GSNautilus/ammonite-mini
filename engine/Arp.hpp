/** The arp generator, the hardware's arp grown into a channel generator:
 *  on every new step of its division (derived from the master clock, with
 *  swing) it decides whether the step plays (Euclidean DENSITY over LENGTH,
 *  counted from the RESTART point), which pool note (MODE, VARY) and how
 *  (GATE, RATCHET), and reports the event with its sample offset inside the
 *  block. The step timing is the shared StepGrid (Steps.hpp). Step lanes
 *  (gate, chance, ratchet, octave, accent) come later in phase 4. */
#pragma once

#include "Clock.hpp"
#include "Dsp.hpp"
#include "Harmony.hpp"
#include "Steps.hpp"

namespace ammo {

enum ArpMode
{
    kArpOff = 0,
    kArpLoop,
    kArpUp,
    kArpDown,
    kArpUpDown,
    kArpRandom
};

struct ArpParams
{
    int   mode = kArpUp, pool = kPoolFifths, range = 1, div = 2, length = 8;
    float gate = 0.5f, density = 1.f, vary = 0.f, ratchet = 0.f;
    int   degree = 0, octave = 0;
};

/** What a step asks the voice to do. */
struct ArpEvent
{
    int   at       = 0;   // sample offset in the block
    float note     = 60.f; // MIDI
    int   gate     = 1;   // samples per hit
    int   ratchets = 1;   // hits in the step (1 = plain)
    int   gap      = 0;   // samples between hits
};

/** The conductor's view a step needs: the chord at any beat and the
 *  restart point of any beat. */
struct StepContext
{
    const Harmony* harmony; // the harmony object to update for the step's chord (scratch)
    Prog           prog;    // the progression playing (none: the manual chord)
    int            key, tonic, change, manualChord, restart, masterOctave;
};

class Arp
{
  public:
    void Init(uint32_t seed)
    {
        rng_ = Rng(seed);
        grid_.Reset();
        pos_ = len_ = 0;
    }

    /** Resets the step memory so the next block starts a step (e.g. when
     *  the generator is switched on). */
    void Rearm() { grid_.Reset(); }

    int  StepPos() const { return pos_; }
    int  StepLen() const { return len_; }

    /** The event of the step that begins in this block, if one does.
     *  `scratch` is a Harmony the arp may update to the step's chord. */
    bool Step(const BlockClock& clk, const ArpParams& p, const StepContext& cx, Harmony& scratch, ArpEvent& ev)
    {
        StepHit h;
        if(!grid_.Begin(clk, kArpDivBeats[p.div], p.length, p.density, cx.restart, cx.change, false, h))
            return false;
        pos_ = h.pos;
        len_ = h.len;
        if(!h.play)
            return false;
        const int    pos = h.pos;
        const double sb  = h.start;

        int pool[kPoolMax];
        scratch.Update(cx.key, ChordAt(sb, cx.prog, cx.change, cx.manualChord)); // the chord this step starts in
        const int n = scratch.BuildPool(p.degree, p.pool, p.range < 1 ? 1 : p.range, pool);
        int       idx;
        switch(p.mode)
        {
            case kArpUp: idx = pos % n; break;
            case kArpDown: idx = n - 1 - pos % n; break;
            case kArpUpDown:
            {
                const int period = n > 1 ? 2 * n - 2 : 1;
                const int m      = pos % period;
                idx              = m < n ? m : period - m;
                break;
            }
            case kArpRandom: idx = (int)(rng_.Next() % (uint32_t)n); break;
            default: idx = 0; break; // Loop: the pool's first note again
        }
        if(rng_.Uniform() < p.vary)
            idx = (int)(rng_.Next() % (uint32_t)n);

        const float stepSmp  = h.stepSmp;
        const int   r        = rng_.Uniform() < p.ratchet ? 2 + (int)(rng_.Next() % 3u) : 1;
        const float gateFrac = 0.05f + 0.95f * Clamp01(p.gate);
        const float base     = (float)(kMidiBase + cx.tonic + 12 * (p.octave + cx.masterOctave));
        ev.at                = h.at;
        ev.note              = FoldNote(base + (float)pool[idx]);
        ev.ratchets          = r;
        ev.gap               = (int)(stepSmp / (float)r);
        ev.gate              = (int)(gateFrac * stepSmp / (float)r);
        if(ev.gate < 1)
            ev.gate = 1;
        return true;
    }

  private:
    Rng      rng_;
    StepGrid grid_;
    int      pos_ = 0, len_ = 0;
};

} // namespace ammo
