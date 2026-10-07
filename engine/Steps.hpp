/** The step clock every generator shares, and the note event they all
 *  produce. A generator asks the grid whether one of its steps begins in
 *  this block (its division on the master clock, with swing); the grid
 *  answers with the step's sample, its place in the pattern (counted from
 *  the RESTART point, mod LENGTH) and whether it is a Euclidean hit
 *  (DENSITY spreads the hits evenly over LENGTH). The generator then decides
 *  what plays: one note (Arp, Bass) or several (Chord). */
#pragma once

#include "Clock.hpp"
#include "Dsp.hpp"
#include "Harmony.hpp"

namespace ammo {

constexpr int kPoly = 6; // voices per channel: a chord's notes; Arp and Bass use the first (= AMMO_POLY)

/** What a generator asks a voice to do: start `note` at sample `at` of the
 *  block (may lie past the block: the channel carries it over), hold it for
 *  `gate` samples, at velocity `vel` (0..1; the drum voice uses it). A
 *  negative note releases the voice at `at` instead. */
struct NoteEvent
{
    int   at    = 0;
    int   voice = 0;
    float note  = 60.f;
    int   gate  = 1;
    float vel   = 1.f;
};

/** A step that begins in this block. */
struct StepHit
{
    long long k       = 0;     // the step's index on the master clock
    int       at      = 0;     // its sample in the block
    int       pos     = 0;     // its place in the pattern (from the restart point)
    int       len     = 1;     // LENGTH
    int       hits    = 1;     // Euclidean hits over LENGTH
    bool      play    = false; // this step is one of them
    bool      joined  = false; // the generator came in mid-step and plays it from sample 0
    double    start   = 0.0;   // the step's beat (a hair inside it)
    float     stepSmp = 0.f;   // its length in samples (what is left of it, when joined)
};

class StepGrid
{
  public:
    /** The next block starts a step (e.g. when the generator is switched on). */
    void Reset() { last_ = kNone; }

    /** Whether a step of `d` beats begins in this block. Arriving mid-step
     *  (the first block after a Reset), the step is skipped, or with
     *  `joinMidStep` played from the block's first sample for what is left
     *  of it (a held chord should not wait for the next change). */
    bool Begin(const BlockClock& clk, double d, int length, float density, int restart, int change, bool joinMidStep,
               StepHit& h)
    {
        // a step whose sample (rounded as below) is the block's last belongs to this block: without the same
        // epsilon here, a start a hair past the last sample's beat went to the next block, one sample late
        const long long k = StepIndex(clk.lastBeat() + 1e-6 * clk.bps, d, clk.swing);
        if(k == last_)
            return false;
        const bool first = last_ == kNone;
        last_            = k;
        const double st  = StepStart(k, d, clk.swing);
        h.joined         = false;
        if(first && st < clk.beat0 - kBeatEps)
        {
            if(!joinMidStep)
                return false; // we arrived mid-step: wait for the next one
            h.joined = true;
        }

        // the step's sample: a start exactly on a sample boundary must round the
        // same way whatever the block size, hence the epsilon before the ceil
        int at = (int)std::ceil((st - clk.beat0) / clk.bps - 1e-6);
        at     = at < 0 ? 0 : (at >= clk.frames ? clk.frames - 1 : at);

        // pattern position: steps since the restart point, mod LENGTH
        const double    sb  = st + kBeatEps;
        // (a step as long as the restart period or longer counts freely: every one would be the first)
        const bool      fre = d >= RestartPeriod(restart, change);
        const long long k0  = fre ? 0 : StepIndex(RestartBeat(sb, restart, change) + kBeatEps, d, clk.swing);
        const int       len = length < 1 ? 1 : length;
        h.k                 = k;
        h.at                = h.joined ? 0 : at;
        h.pos               = (int)(((k - k0) % len + len) % len);
        h.len               = len;
        h.hits              = (int)(Clamp01(density) * (float)len + 0.5f);
        h.play              = (h.pos * h.hits) % len < h.hits; // Euclidean: hits spread evenly over LENGTH
        h.start             = sb;
        h.stepSmp           = h.joined ? (float)((st + StepBeats(k, d, clk.swing) - clk.beat0) / clk.bps)
                                       : (float)(StepBeats(k, d, clk.swing) / clk.bps);
        return true;
    }

  private:
    static constexpr long long kNone = (-9223372036854775807LL - 1);
    long long last_ = kNone;
};

} // namespace ammo
