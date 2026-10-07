/** The engine: 16 channel slots, the conductor, the shared reverb, the master bus, parameters
 *  by stable id, the state chunk and the telemetry ring. No plugin or UI
 *  knowledge; see docs/PHASE2_ENGINE.md. */
#pragma once

#include "Channel.hpp"
#include "Conductor.hpp"
#include "Params.hpp"
#include "Record.hpp"
#include "Telemetry.hpp"

#include <atomic>
#include <string>

namespace ammo {

class Engine
{
  public:
    static constexpr int kMaxBlock = 4096;

    Engine(double sampleRate, int maxBlock);

    void   SetSampleRate(double sampleRate);
    double SampleRate() const { return sr_; }

    /** Any thread: the host-side value of a parameter (clamped, stepped). */
    void  SetParam(int id, float value);
    float GetParam(int id) const;
    /** Audio thread, at a block start: the engine-side copy of all params. */

    /** Audio thread: render a block (any size up to kMaxBlock; larger blocks
     *  are split). Clock null = internal. */
    void Process(float* outL, float* outR, int frames, const HostClock* clock);

    Telemetry& telemetry() { return tele_; }
    /** The master output, after the master bus, while armed (Record.hpp). */
    RecordTap& recordTap() { return tap_; }
    int        instance() const { return instance_; }
    /** Samples the output lags the music: the limiter's look-ahead. */
    int latency() const { return limiter_.Latency(); }

    /** The state chunk: a versioned text, every non-default parameter.
     *  Lines Load cannot parse are skipped (a patch file's `page` line). */
    std::string Save() const;
    bool        Load(const char* text, size_t len);
    /** A chunk into a value per id (kNumIds): table defaults, then the
     *  chunk's values, clamped; false if it is not a chunk. */
    static bool ParseState(const char* text, size_t len, float* values);

    /** Reset every parameter to the table defaults plus the default patch. */
    void ResetToDefaults();

  private:
    void ProcessBlock(float* outL, float* outR, int frames, const HostClock* clock);
    void ReadParams();
    void MasterBus(float* outL, float* outR, int frames, AmmoFrame& f);

    double             sr_ = 48000.0;
    int                maxBlock_ = 512;
    int                instance_ = 0;
    std::atomic<float> params_[kNumIds];
    Conductor          cond_;
    Channel            ch_[kSlots];
    Reverb             reverb_;
    float              revL_[kMaxBlock], revR_[kMaxBlock]; // the reverb send bus
    Glue               glue_;
    Limiter            limiter_;
    Smoother           volume_;
    bool               volFresh_ = true;
    Telemetry          tele_;
    RecordTap          tap_;
    uint32_t           seq_ = 0;
    bool               hostClockSeen_ = false;
};

} // namespace ammo
