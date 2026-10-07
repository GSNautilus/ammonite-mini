/** The bass generator: the chord's root on the step grid (DIVISION, LENGTH,
 *  DENSITY, GATE, VARY, RATCHET as the arp), one note at a time.
 *
 *  PATTERN, counted over the hits since the restart point:
 *  Root (the root every hit), Root-5th (root, in-key fifth, ...), Octaves
 *  (root, octave up, ...), Walk (root, third, fifth, sixth, ... and on the
 *  last step before a chord change, a half step next to the next chord's
 *  root, on the side the line comes from, leading into it). VARY swaps a
 *  hit, at that chance, for the root, fifth or octave. DEGREE moves the
 *  "root" up the chord as for the arp.
 *  Octave 0 is the arp's (C2). */
#pragma once

#include "Arp.hpp"
#include "Steps.hpp"

#include <algorithm>

namespace ammo {

enum BassPattern
{
    kBassRoot = 0,
    kBassRootFifth,
    kBassOctaves,
    kBassWalk
};

class BassGen
{
  public:
    void Init(uint32_t seed)
    {
        rng_ = Rng(seed);
        grid_.Reset();
        pos_ = len_ = 0;
    }
    void Rearm() { grid_.Reset(); }
    int  StepPos() const { return pos_; }
    int  StepLen() const { return len_; }

    /** The hits of the step that begins in this block (one, or a ratchet's
     *  2-4): returns how many and writes them into `out`. */
    int Step(const BlockClock& clk, const ArpParams& a, int pattern, const StepContext& cx, Harmony& scratch, NoteEvent* out)
    {
        StepHit h;
        if(!grid_.Begin(clk, kArpDivBeats[a.div], a.length, a.density, cx.restart, cx.change, false, h))
            return 0;
        pos_ = h.pos;
        len_ = h.len;
        if(!h.play)
            return 0;

        scratch.Update(cx.key, ChordAt(h.start, cx.prog, cx.change, cx.manualChord));
        const int root = scratch.DegreeSemis(a.degree);
        const int hit  = h.hits > 0 ? (h.pos * h.hits) / h.len : 0; // which hit of the pattern this is
        int       semis = root;
        switch(pattern)
        {
            case kBassRootFifth: semis = (hit & 1) ? root + scratch.KeyFifth(a.degree) : root; break;
            case kBassOctaves: semis = (hit & 1) ? root + 12 : root; break;
            case kBassWalk:
            {
                // the change this step leads into: the progression's, or the bar's while it is off
                const double cb   = kProgs[cx.prog].n > 0 ? kChangeBeats[cx.change] : 4.0;
                const double next = (std::floor(h.start / cb) + 1.0) * cb;
                if(h.start + h.stepSmp * clk.bps >= next - 1e-6)
                {
                    Harmony nx = scratch;
                    nx.Update(cx.key, ChordAt(next + kBeatEps, cx.prog, cx.change, cx.manualChord));
                    const int target = nx.DegreeSemis(a.degree); // where the next bar's root will sound
                    semis            = target >= root ? target - 1 : target + 1; // a half step short of it: it leads in
                }
                else
                {
                    static const int kScaleWalk[4] = {0, 2, 4, 5}, kChordWalk[4] = {0, 1, 2, 1};
                    semis = scratch.DegreeSemis(a.degree + (scratch.chordKey ? kChordWalk : kScaleWalk)[hit % 4]);
                }
                break;
            }
            default: break;
        }
        if(rng_.Uniform() < a.vary)
        {
            const int pick = (int)(rng_.Next() % 3u);
            semis          = pick == 0 ? root : (pick == 1 ? root + scratch.KeyFifth(a.degree) : root + 12);
        }

        const int   r        = rng_.Uniform() < a.ratchet ? 2 + (int)(rng_.Next() % 3u) : 1;
        const float gateFrac = 0.05f + 0.95f * Clamp01(a.gate);
        const int   gap      = std::max(1, (int)(h.stepSmp / (float)r));
        const int   gate     = std::max(1, (int)(gateFrac * h.stepSmp / (float)r));
        const float note     = FoldNote((float)(kMidiBase + cx.tonic + 12 * (a.octave + cx.masterOctave) + semis));
        for(int j = 0; j < r; j++)
        {
            out[j].at    = h.at + j * gap;
            out[j].voice = 0;
            out[j].note  = note;
            out[j].gate  = gate;
        }
        return r;
    }

  private:
    Rng      rng_;
    StepGrid grid_;
    int      pos_ = 0, len_ = 0;
};

} // namespace ammo
