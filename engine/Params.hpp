/** The parameter table of Ammonite Desktop: every host parameter, with a
 *  stable id that is never renumbered (docs/PHASE2_ENGINE.md section 2).
 *
 *  Ids 0..63 are global; slot s (0..15) owns 64 + 128 s .. 64 + 128 s + 127.
 *  Unused ids inside a block are reserved: hidden parameters today, room for
 *  tomorrow. Adding a parameter means taking the next free index of its
 *  block, never moving an existing one.
 *
 *  Values are in natural units where that reads well (BPM, cents, pan -1..1,
 *  integers for steps) and 0..1 otherwise; the curves behind the 0..1 ones
 *  are in Dsp.hpp (times, cutoff). */
#pragma once

#include <cmath>
#include <cstdint>

namespace ammo {

constexpr int kSlots      = 16;
constexpr int kGlobalIds  = 64;
constexpr int kSlotStride = 128;
constexpr int kNumIds     = kGlobalIds + kSlots * kSlotStride; // 2112

enum GlobalParam
{
    gTempo = 0,
    gSync,
    gSwing,
    gRoot,
    gScale,
    gProg,
    gChange,
    gChord,
    gRestart,
    gOctave,
    gVolume,
    gMacro1,
    gMacro2,
    gMacro3,
    gMacro4,
    // phase 4, package B: the shared reverb
    gRevSize,
    gRevDecay,
    gRevDamping,
    gRevPreDelay,
    gRevWidth,
    gRevReturn,
    // phase 4, package B: the master bus
    gGlue,
    gCeiling,
    kNumGlobalParams
};

enum SlotParam
{
    cGen = 0,
    cInst,
    cLevel,
    cPan,
    cMute,
    cShow,
    cDegree,
    cOctave,
    cArpMode,
    cArpPool,
    cArpRange,
    cArpDiv,
    cArpLength,
    cArpGate,
    cArpDensity,
    cArpVary,
    cArpRatchet,
    cShape,
    cDetune,
    cSub,
    cNoise,
    cCutoff,
    cReso,
    cFilterType,
    cDrive,
    cAmpAttack,
    cAmpDecay,
    cAmpSustain,
    cAmpRelease,
    cFiltEnvAmount,
    cFiltAttack,
    cFiltDecay,
    cPitchEnvAmount,
    cPitchDecay,
    cGlide,
    // phase 4: the chord and bass generators
    cChordNotes,
    cChordVoicing,
    cChordLead,
    cChordRhythm,
    cChordStrum,
    cBassPattern,
    // phase 4: the rhythm generator and the drum voice
    cRhythmRotate,
    cRhythmChance,
    cRhythmPitch,
    cDrumModel,
    cDrumTune,
    cDrumDecay,
    cDrumTone,
    cDrumSnap,
    // phase 4, package B: the channel's inserts
    cFxDrive,
    cFxTone,
    cChorusOn,
    cChorusRate,
    cChorusDepth,
    cChorusMix,
    cDelayDiv,
    cDelayFeedback,
    cDelayPingPong,
    cDelayDamping,
    cDelayMix,
    // phase 4, package B: the sends
    cRevSend,
    cDuckSource,
    cDuckAmount,
    // phase 4, sound after the first listen
    cChorusMode,
    cChordLetRing,
    kNumSlotParams
};

enum ParamFlags : uint32_t
{
    pfAutomatable = 1,
    pfInteger     = 2, // steps or integers: shown as names or whole numbers
    pfHidden      = 4, // a reserved id: not shown, not saved
    pfBoolean     = 8,
};

struct ParamDef
{
    const char*        name;   // "Arp Mode"
    const char*        symbol; // "arp_mode" ([a-z0-9_])
    float              min, max, def;
    int                steps;  // > 0: a stepped parameter with that many values (min..max integers)
    const char* const* names;  // step names, or null for plain integers
    uint32_t           flags;
};

// ---- step names (the hardware's lists, kept word for word where they exist)
inline const char* const kSyncNames[]    = {"Host", "Internal"};
inline const char* const kNoteNames[]    = {"C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"};
inline const char* const kScaleNames[]   = {"Major", "Minor", "Dorian", "Phrygian", "Lydian", "Mixolydian", "Harmonic minor", "Pentatonic", "Pentatonic minor", "Blues",
                                            "Maj", "Min", "Sus2", "Sus4", "Maj7", "Min7", "Dom7", "Dim", "Aug", "Add9"};
inline const char* const kProgNames[]    = {"Off", "Pop I V vi IV", "50s I vi IV V", "Sad vi IV I V", "Epic i VI III VII", "Jazz ii V I I", "Vamp I IV", "Canon", "Fall i VII VI v"};
inline const char* const kChangeNames[]  = {"1/2 bar", "1 bar", "2 bars", "4 bars"};
inline const char* const kRomanNames[]   = {"I", "II", "III", "IV", "V", "VI", "VII"};
inline const char* const kRestartNames[] = {"Free", "Bar", "Chord"};
inline const char* const kGenNames[]     = {"Off", "Arp", "Chord", "Bass", "Rhythm"};
inline const char* const kInstNames[]    = {"Synth", "Drum"};
inline const char* const kArpModeNames[] = {"Off", "Loop", "Up", "Down", "Up-down", "Random"};
inline const char* const kArpPoolNames[] = {"Key", "Triad", "7th", "Fifths", "Root"};
inline const char* const kArpDivNames[]  = {"4/1",  "2/1", "1/1", "1/2.", "1/2",  "1/4.",  "1/4",
                                            "1/4T", "1/8.", "1/8", "1/8T", "1/16", "1/16T", "1/32"};
inline const char* const kOffOnNames[]   = {"Off", "On"};
inline const char* const kChordNotesNames[]   = {"Triad", "7th", "9th"};
inline const char* const kChordVoicingNames[] = {"Close", "Open", "Drop 2", "Spread"};
inline const char* const kChordLeadNames[]    = {"Fixed", "Smooth"};
inline const char* const kChordRhythmNames[]  = {"Hold", "Steps", "Arp"};
inline const char* const kBassPatternNames[]  = {"Root", "Root-5th", "Octaves", "Walk"};
inline const char* const kRhythmPitchNames[]  = {"Fixed", "Root", "Fifth"};
inline const char* const kDrumModelNames[]    = {"Kick", "Snare", "Hat", "Open hat", "Clap", "Tom", "Rim", "Noise"};
inline const char* const kDelayDivNames[]     = {"1/32", "1/16", "1/16T", "1/8", "1/8T", "1/8.", "1/4", "1/4T", "1/4.", "1/2", "1/1"};
inline const char* const kChorusModeNames[]   = {"Chorus", "Ensemble", "Vibrato"};
inline const char* const kDuckSourceNames[]   = {"Off", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16"};

constexpr uint32_t kA  = pfAutomatable;
constexpr uint32_t kAI = pfAutomatable | pfInteger;

inline const ParamDef kGlobalDefs[kNumGlobalParams] = {
    {"Tempo", "tempo", 20.f, 240.f, 110.f, 0, nullptr, kA},
    {"Sync", "sync", 0.f, 1.f, 0.f, 2, kSyncNames, kAI},
    {"Swing", "swing", 0.f, 1.f, 0.f, 0, nullptr, kA},
    {"Root", "root", 0.f, 11.f, 9.f, 12, kNoteNames, kAI},
    {"Scale", "scale", 0.f, 19.f, 1.f, 20, kScaleNames, kAI},
    {"Progression", "prog", 0.f, 8.f, 0.f, 9, kProgNames, kAI},
    {"Chord change", "change", 0.f, 3.f, 1.f, 4, kChangeNames, kAI},
    {"Chord", "chord", 0.f, 6.f, 0.f, 7, kRomanNames, kAI},
    {"Restart", "restart", 0.f, 2.f, 0.f, 3, kRestartNames, kAI},
    {"Master octave", "octave", -2.f, 2.f, 0.f, 5, nullptr, kAI},
    {"Volume", "volume", 0.f, 1.f, 0.8f, 0, nullptr, kA},
    {"Macro 1", "macro1", 0.f, 1.f, 0.f, 0, nullptr, kA},
    {"Macro 2", "macro2", 0.f, 1.f, 0.f, 0, nullptr, kA},
    {"Macro 3", "macro3", 0.f, 1.f, 0.f, 0, nullptr, kA},
    {"Macro 4", "macro4", 0.f, 1.f, 0.f, 0, nullptr, kA},
    {"Reverb size", "rev_size", 0.f, 1.f, 0.5f, 0, nullptr, kA},
    {"Reverb decay", "rev_decay", 0.f, 1.f, 0.45f, 0, nullptr, kA},
    {"Reverb damping", "rev_damp", 0.f, 1.f, 0.4f, 0, nullptr, kA},
    {"Reverb pre-delay", "rev_pre", 0.f, 1.f, 0.1f, 0, nullptr, kA},
    {"Reverb width", "rev_width", 0.f, 1.f, 1.f, 0, nullptr, kA},
    {"Reverb return", "rev_return", 0.f, 1.f, 0.6f, 0, nullptr, kA},
    {"Glue", "glue", 0.f, 1.f, 0.3f, 0, nullptr, kA},           // the master compressor: 0 off
    {"Ceiling", "ceiling", -12.f, 0.f, -0.3f, 0, nullptr, kA}, // the limiter, dBFS
};

inline const ParamDef kSlotDefs[kNumSlotParams] = {
    {"Generator", "gen", 0.f, 4.f, 0.f, 5, kGenNames, kAI},
    {"Instrument", "inst", 0.f, 1.f, 0.f, 2, kInstNames, kAI},
    {"Level", "level", 0.f, 1.f, 0.7f, 0, nullptr, kA},
    {"Pan", "pan", -1.f, 1.f, 0.f, 0, nullptr, kA},
    {"Mute", "mute", 0.f, 1.f, 0.f, 2, kOffOnNames, kAI | pfBoolean},
    {"Show", "show", 0.f, 1.f, 1.f, 2, kOffOnNames, pfInteger | pfBoolean}, // the eye: saved, not automated
    {"Degree", "degree", 0.f, 7.f, 0.f, 8, nullptr, kAI},
    {"Octave", "oct", -4.f, 4.f, 0.f, 9, nullptr, kAI},
    {"Arp mode", "arp_mode", 0.f, 5.f, 2.f, 6, kArpModeNames, kAI},
    {"Arp pool", "arp_pool", 0.f, 4.f, 3.f, 5, kArpPoolNames, kAI},
    {"Arp range", "arp_range", 1.f, 3.f, 1.f, 3, nullptr, kAI},
    {"Arp division", "arp_div", 0.f, 13.f, 6.f, 14, kArpDivNames, kAI},
    {"Arp length", "arp_len", 1.f, 16.f, 8.f, 16, nullptr, kAI},
    {"Arp gate", "arp_gate", 0.f, 1.f, 0.5f, 0, nullptr, kA},
    {"Arp density", "arp_density", 0.f, 1.f, 1.f, 0, nullptr, kA},
    {"Arp vary", "arp_vary", 0.f, 1.f, 0.f, 0, nullptr, kA},
    {"Arp ratchet", "arp_ratchet", 0.f, 1.f, 0.f, 0, nullptr, kA},
    {"Shape", "shape", 0.f, 1.f, 0.3f, 0, nullptr, kA},
    {"Detune", "detune", 0.f, 50.f, 6.f, 0, nullptr, kA},
    {"Sub", "sub", 0.f, 1.f, 0.f, 0, nullptr, kA},
    {"Noise", "noise", 0.f, 1.f, 0.f, 0, nullptr, kA},
    {"Cutoff", "cutoff", 0.f, 1.f, 0.8f, 0, nullptr, kA},
    {"Resonance", "reso", 0.f, 1.f, 0.2f, 0, nullptr, kA},
    {"Filter type", "filter_type", 0.f, 1.f, 0.f, 0, nullptr, kA},
    {"Drive", "drive", 0.f, 1.f, 0.f, 0, nullptr, kA},
    {"Amp attack", "amp_a", 0.f, 1.f, 0.1f, 0, nullptr, kA},
    {"Amp decay", "amp_d", 0.f, 1.f, 0.45f, 0, nullptr, kA},
    {"Amp sustain", "amp_s", 0.f, 1.f, 0.3f, 0, nullptr, kA},
    {"Amp release", "amp_r", 0.f, 1.f, 0.45f, 0, nullptr, kA},
    {"Filter env amount", "filt_amt", -1.f, 1.f, 0.f, 0, nullptr, kA},
    {"Filter attack", "filt_a", 0.f, 1.f, 0.f, 0, nullptr, kA},
    {"Filter decay", "filt_d", 0.f, 1.f, 0.4f, 0, nullptr, kA},
    {"Pitch env amount", "pitch_amt", -1.f, 1.f, 0.f, 0, nullptr, kA},
    {"Pitch decay", "pitch_d", 0.f, 1.f, 0.3f, 0, nullptr, kA},
    {"Glide", "glide", 0.f, 1.f, 0.f, 0, nullptr, kA},
    {"Chord notes", "chord_notes", 0.f, 2.f, 0.f, 3, kChordNotesNames, kAI},
    {"Chord voicing", "chord_voicing", 0.f, 3.f, 0.f, 4, kChordVoicingNames, kAI},
    {"Voice leading", "chord_lead", 0.f, 1.f, 1.f, 2, kChordLeadNames, kAI},
    {"Chord rhythm", "chord_rhythm", 0.f, 2.f, 0.f, 3, kChordRhythmNames, kAI},
    {"Strum", "chord_strum", 0.f, 1.f, 0.f, 0, nullptr, kA},
    {"Bass pattern", "bass_pattern", 0.f, 3.f, 0.f, 4, kBassPatternNames, kAI},
    {"Rotate", "rhy_rotate", 0.f, 15.f, 0.f, 16, nullptr, kAI},
    {"Chance", "rhy_chance", 0.f, 1.f, 1.f, 0, nullptr, kA},
    {"Rhythm pitch", "rhy_pitch", 0.f, 2.f, 0.f, 3, kRhythmPitchNames, kAI},
    {"Drum", "drum_model", 0.f, 7.f, 0.f, 8, kDrumModelNames, kAI},
    {"Drum tune", "drum_tune", -12.f, 12.f, 0.f, 0, nullptr, kA},
    {"Drum decay", "drum_decay", 0.f, 1.f, 0.5f, 0, nullptr, kA},
    {"Drum tone", "drum_tone", 0.f, 1.f, 0.5f, 0, nullptr, kA},
    {"Drum snap", "drum_snap", 0.f, 1.f, 0.5f, 0, nullptr, kA},
    {"FX drive", "fx_drive", 0.f, 1.f, 0.f, 0, nullptr, kA}, // 0: off (the voice's own Drive is id 24)
    {"FX drive tone", "fx_tone", -1.f, 1.f, 0.f, 0, nullptr, kA},
    {"Chorus", "cho_on", 0.f, 1.f, 0.f, 2, kOffOnNames, kAI | pfBoolean},
    {"Chorus rate", "cho_rate", 0.f, 1.f, 0.4f, 0, nullptr, kA},
    {"Chorus depth", "cho_depth", 0.f, 1.f, 0.5f, 0, nullptr, kA},
    {"Chorus mix", "cho_mix", 0.f, 1.f, 0.5f, 0, nullptr, kA},
    {"Delay division", "dly_div", 0.f, 10.f, 3.f, 11, kDelayDivNames, kAI},
    {"Delay feedback", "dly_fb", 0.f, 0.95f, 0.4f, 0, nullptr, kA},
    {"Ping-pong", "dly_pp", 0.f, 1.f, 0.f, 2, kOffOnNames, kAI | pfBoolean},
    {"Delay damping", "dly_damp", 0.f, 1.f, 0.3f, 0, nullptr, kA},
    {"Delay mix", "dly_mix", 0.f, 1.f, 0.f, 0, nullptr, kA}, // 0: off
    {"Reverb send", "rev_send", 0.f, 1.f, 0.f, 0, nullptr, kA},
    {"Duck source", "duck_src", 0.f, 16.f, 0.f, 17, kDuckSourceNames, kAI}, // 0: off, else the slot (1..16)
    {"Duck amount", "duck_amt", 0.f, 1.f, 0.5f, 0, nullptr, kA},
    {"Chorus mode", "cho_mode", 0.f, 2.f, 0.f, 3, kChorusModeNames, kAI},          // with Chorus (on / off) as before
    {"Let ring", "chord_ring", 0.f, 1.f, 0.f, 2, kOffOnNames, kAI | pfBoolean}, // Chord's Arp: each note held to the change
};

inline const ParamDef kHiddenDef = {"(reserved)", "reserved", 0.f, 1.f, 0.f, 0, nullptr, pfHidden};

inline int  SlotId(int slot, int p) { return kGlobalIds + slot * kSlotStride + p; }
inline bool IsSlotId(int id, int& slot, int& p)
{
    if(id < kGlobalIds || id >= kNumIds)
        return false;
    slot = (id - kGlobalIds) / kSlotStride;
    p    = (id - kGlobalIds) % kSlotStride;
    return true;
}
inline bool IsGlobalId(int id) { return id >= 0 && id < kGlobalIds; }

/** The definition behind an id; kHiddenDef for reserved ids. */
inline const ParamDef& ParamInfo(int id)
{
    int slot, p;
    if(IsGlobalId(id))
        return id < kNumGlobalParams ? kGlobalDefs[id] : kHiddenDef;
    if(IsSlotId(id, slot, p))
        return p < kNumSlotParams ? kSlotDefs[p] : kHiddenDef;
    return kHiddenDef;
}

/** The visible parameters in order (globals, then each slot's): what a
 *  host sees. The host index is not the id. */
inline int VisibleParamCount() { return kNumGlobalParams + kSlots * kNumSlotParams; }
inline int VisibleId(int index)
{
    if(index < 0)
        return -1;
    if(index < kNumGlobalParams)
        return index;
    index -= kNumGlobalParams;
    const int slot = index / kNumSlotParams, p = index % kNumSlotParams;
    return slot < kSlots ? SlotId(slot, p) : -1;
}
inline int VisibleIndexOf(int id)
{
    int slot, p;
    if(IsGlobalId(id))
        return id < kNumGlobalParams ? id : -1;
    if(IsSlotId(id, slot, p) && p < kNumSlotParams)
        return kNumGlobalParams + slot * kNumSlotParams + p;
    return -1;
}

inline float ClampParam(int id, float v)
{
    const ParamDef& d = ParamInfo(id);
    if(d.steps > 0)
        v = std::round(v);
    return v < d.min ? d.min : (v > d.max ? d.max : v);
}

/** The default patch: the hardware's three default arps, A minor, 110 BPM
 *  (docs/PHASE2_ENGINE.md section 2). Applied over the table defaults. */
struct PatchEntry
{
    int   slot, param;
    float value;
};
inline const PatchEntry kDefaultPatch[] = {
    // slot 1: UP, FIFTHS, 1 octave, 1/4, length 8: a saw pluck
    {0, cGen, 1}, {0, cArpMode, 2}, {0, cArpPool, 3}, {0, cArpRange, 1}, {0, cArpDiv, kDiv4}, {0, cArpLength, 8},
    {0, cOctave, 0}, {0, cDegree, 0}, {0, cLevel, 0.8f}, {0, cShape, 0.667f}, {0, cAmpSustain, 0.4f}, {0, cAmpDecay, 0.656f},
    {0, cAmpRelease, 0.656f}, {0, cPan, 0.f},
    // slot 2: UP-DOWN, TRIAD, 2 octaves, 1/8, length 8: a square-ish pluck an octave up
    {1, cGen, 1}, {1, cArpMode, 4}, {1, cArpPool, 1}, {1, cArpRange, 2}, {1, cArpDiv, kDiv8}, {1, cArpLength, 8},
    {1, cOctave, 1}, {1, cDegree, 2}, {1, cLevel, 0.7f}, {1, cShape, 1.0f}, {1, cAmpSustain, 0.f}, {1, cAmpDecay, 0.585f},
    {1, cAmpRelease, 0.585f}, {1, cPan, -0.4f},
    // slot 3: RANDOM, KEY, 2 octaves, 1/16, length 6, density 0.6: a soft high sparkle
    {2, cGen, 1}, {2, cArpMode, 5}, {2, cArpPool, 0}, {2, cArpRange, 2}, {2, cArpDiv, kDiv16}, {2, cArpLength, 6},
    {2, cArpDensity, 0.6f}, {2, cOctave, 2}, {2, cDegree, 4}, {2, cLevel, 0.6f}, {2, cShape, 0.2f}, {2, cAmpSustain, 0.f},
    {2, cAmpDecay, 0.536f}, {2, cAmpRelease, 0.536f}, {2, cPan, 0.4f},
};
inline constexpr int kDefaultPatchSize = sizeof(kDefaultPatch) / sizeof(kDefaultPatch[0]);

} // namespace ammo
