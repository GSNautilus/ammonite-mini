/** Ammonite Mini's bridge: between the page and the engine, with no platform code (docs/MINI_PLAN.md section 3).
 *  The portable part of desktop's AmmoniteUI.cpp (ammonite efc533a): the page's one-line messages in, the
 *  JavaScript to run out. The platform does the rest through AmmoBridgeHost's callbacks: run JS in the page,
 *  show a Save or Open picker, hear of a finished recording, log.
 *
 *  Page -> bridge: ready | set <id> <v> | edit <id> <0|1> | preset <k> | save <json> | open | record <0|1> |
 *                  key <down> <vk> <repeat> | log ...
 *  Bridge -> page: ammo.params([...]) ammo.values([[id,v],...]) ammo.presets([{n,b}], k, file) ammo.page("json")
 *                  ammo.rec({...}) ammo.toast("text") ammo.info({}) ammo.tick([...], host)
 *
 *  Differences from desktop:
 *  - Parameters go straight to the engine (there is no plugin host to tell); `edit` is accepted and ignored.
 *  - The transport is the bridge's: the clock is always the engine's internal one, which never stops, so
 *    play / stop (Space: key 32) is a state here that the audio callback reads (Playing()): stopped, it
 *    outputs silence and leaves the engine where it was. Ticks report it as `p`.
 *  - Patch files are written and read by the platform (Android's pickers give streams, not paths): on `save`
 *    the platform is asked for a picker, writes PatchText() where the user chose and calls Saved(); on `open`,
 *    it reads the file and calls Opened() with its text.
 *  - Recordings go to a folder the platform names (plain fopen), and the platform hears of each one after.
 *
 *  Threads: OnMessage, Tick, Saved and Opened on one thread (the platform's UI thread); Playing() from any. */
#pragma once

#include "Engine.hpp"
#include "Record.hpp"

#include <atomic>
#include <string>

extern "C" {
/** What the platform does for the bridge; any callback may be null. */
typedef struct AmmoBridgeHost
{
    void* user;
    void (*eval)(void* user, const char* js);                       // run this in the page
    void (*pick)(void* user, int save, const char* suggestedName);  // show a Save (1) or Open (0) picker for .ammo
    void (*recorded)(void* user, const char* path, int ok);         // a recording was closed (Android: share it)
    void (*log)(void* user, const char* line);
} AmmoBridgeHost;
}

namespace ammo {

class Bridge
{
  public:
    /** recordDir: the folder recordings are written to (created by the platform). */
    Bridge(Engine& engine, const AmmoBridgeHost& host, const std::string& recordDir);
    ~Bridge();

    void OnMessage(const char* msg);
    /** Every telemetry frame published since the last call, to the page in one ammo.tick. The platform calls it
     *  once per display frame; it also drains a recording. */
    void Tick();

    bool Playing() const { return playing_.load(std::memory_order_relaxed); }
    void SetPlaying(bool on);

    /** The patch to write after a Save picker: the engine's chunk and the page's line. */
    std::string PatchText() const;
    /** After the Save picker: written as `name` (shown in the preset box), or not. Empty name: cancelled. */
    void Saved(const std::string& name, bool ok);
    /** After the Open picker: the file's name and its text. */
    void Opened(const std::string& name, const char* text, size_t len);

    bool Ready() const { return ready_; }

  private:
    void Eval(const std::string& js);
    void Log(const std::string& line);
    void SendParams();
    void SendValues(const float* byId = nullptr);
    void ApplyValues(const float* byId);
    void SendPresets();
    void Toast(const std::string& text);
    std::string PatchName() const;
    void StartRecording();
    void StopRecording(bool tell);

    Engine&           engine_;
    AmmoBridgeHost    host_;
    std::string       recordDir_;
    std::atomic<bool> playing_{true};
    bool              ready_ = false;
    int               preset_ = 1;  // First light, the default patch; -1: a patch file
    std::string       file_;        // that file's name, when one is open (or was just saved)
    std::string       pageJson_;    // the page's state for the next save
    WavWriter         wav_;
    std::string       recPath_;
    double            recRate_ = 48000.0, lastEvalMs_ = 0.0;
};

} // namespace ammo
