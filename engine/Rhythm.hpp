/** The rhythm generator: hits with no melody, for drums (or a pitched
 *  sound struck on a pattern).
 *
 *  The step grid as every generator (DIVISION, LENGTH, DENSITY = how many
 *  hits, spread evenly: a Euclidean rhythm), plus ROTATE (the pattern
 *  turned by that many steps, so a kick and a snare of the same length can
 *  interlock), CHANCE (each hit plays at that probability), RATCHET (a hit
 *  becomes a roll of 2-4) and VARY (each hit's velocity drops by up to 60 %
 *  at random, for a human feel).
 *
 *  PITCH: Fixed plays C4 (a drum untransposed); Root and Fifth follow the
 *  chord's root or in-key fifth, folded to within a tritone of C4, for
 *  tuned drums and percussion that move with the harmony. OCTAVE shifts. */
#pragma once

#include "Arp.hpp"
#include "Steps.hpp"

#include <algorithm>

namespace ammo {

enum RhythmPitch
{
    kRhythmFixed = 0,
    kRhythmRoot,
    kRhythmFifth
};

struct RhythmParams
{
    int   rotate = 0, pitch = kRhythmFixed;
    float chance = 1.f;
};

class RhythmGen
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

    /** The hits of the step that begins in this block: returns how many (a
     *  roll: 2-4) and writes them into `out`. */
    int Step(const BlockClock& clk, const ArpParams& a, const RhythmParams& r, const StepContext& cx, Harmony& scratch,
             NoteEvent* out)
    {
        StepHit h;
        // density 1: every step plays here, the grid's own Euclid is redone below with the rotation
        if(!grid_.Begin(clk, kArpDivBeats[a.div], a.length, 1.f, cx.restart, cx.change, false, h))
            return 0;
        pos_ = h.pos;
        len_ = h.len;
        const int len  = h.len;
        const int hits = (int)(Clamp01(a.density) * (float)len + 0.5f);
        const int rot  = ((r.rotate % len) + len) % len;
        const int p    = (h.pos + len - rot) % len; // the pattern turned right by ROTATE
        if(!((p * hits) % len < hits))
            return 0;
        if(rng_.Uniform() >= r.chance)
            return 0;

        int semis = 0;
        if(r.pitch != kRhythmFixed)
        {
            scratch.Update(cx.key, ChordAt(h.start, cx.prog, cx.change, cx.manualChord));
            semis = (cx.tonic + scratch.DegreeSemis(a.degree) + (r.pitch == kRhythmFifth ? scratch.KeyFifth(a.degree) : 0)) % 12;
            if(semis > 6)
                semis -= 12; // within a tritone of C
        }
        const float vel      = 1.f - 0.6f * Clamp01(a.vary) * rng_.Uniform();
        const int   rolls    = rng_.Uniform() < a.ratchet ? 2 + (int)(rng_.Next() % 3u) : 1;
        const float gateFrac = 0.05f + 0.95f * Clamp01(a.gate);
        const int   gap      = std::max(1, (int)(h.stepSmp / (float)rolls));
        const int   gate     = std::max(1, (int)(gateFrac * h.stepSmp / (float)rolls));
        const float note     = FoldNote((float)(60 + semis + 12 * (a.octave + cx.masterOctave)));
        for(int j = 0; j < rolls; j++)
        {
            out[j].at    = h.at + j * gap;
            out[j].voice = 0;
            out[j].note  = note;
            out[j].gate  = gate;
            out[j].vel   = vel * (j == 0 ? 1.f : 0.75f); // a roll's later hits a little softer
        }
        return rolls;
    }

  private:
    Rng      rng_;
    StepGrid grid_;
    int      pos_ = 0, len_ = 0;
};

} // namespace ammo
