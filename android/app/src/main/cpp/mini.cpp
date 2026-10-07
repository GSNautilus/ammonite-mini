/* Ammonite Mini, phase 1: the engine playing through Oboe, and a bench (docs/MINI_PLAN.md section 4).

   Play: an Oboe stream (AAudio, low latency, exclusive if granted, float stereo at the device's rate) whose
   callback runs ammo_process with no host clock and Sync on Internal, so the engine's own clock runs. The
   callback thread is pinned to the fastest cores. Each callback is timed against the audio it makes: its load
   (0..1 of the time it had), kept as the mean and the worst over the last second and the worst since start, with
   Oboe's xrun count (the dropouts).

   Bench: a fresh engine on a thread pinned the same way renders 10 s offline in 192-frame blocks for three
   patches (the default preset; 16 channels with every effect on; 16 chord channels) and reports the time each
   took, as a share of real time.

   JNI: com.ammonite.mini.Native start / stop / status / bench (strings for the screen and logcat, tag AmmoMini). */
#include <jni.h>
#include <oboe/Oboe.h>
#include <android/log.h>
#include <sched.h>
#include <unistd.h>

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstdio>
#include <cstring>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#include "api.h"

#define LOG(...) __android_log_print(ANDROID_LOG_INFO, "AmmoMini", __VA_ARGS__)

namespace {

using Clock = std::chrono::steady_clock;
constexpr int kMaxBlock = 4096;

/* ---------------------------------------------------------------- the parameters, by symbol */
int paramId(const char* sym, int slot) // slot -1: a global; a slot's are listed as s1_gen .. s16_gen
{
    char full[48];
    if(slot < 0) std::snprintf(full, sizeof full, "%s", sym);
    else std::snprintf(full, sizeof full, "s%d_%s", slot + 1, sym);
    AmmoParamInfo pi;
    for(int i = 0, n = ammo_param_count(); i < n; i++)
        if(ammo_param_info(i, &pi) && !std::strcmp(pi.symbol, full))
            return pi.id;
    LOG("no parameter %s", full);
    return -1;
}
void set(void* e, const char* sym, int slot, float v) { int id = paramId(sym, slot); if(id >= 0) ammo_set_param(e, id, v); }

int presetIndex(const char* name)
{
    for(int k = 0, n = ammo_preset_count(); k < n; k++)
        if(!std::strcmp(ammo_preset_name(k), name)) return k;
    return 1;
}

/* the patches the bench plays; every one on the internal clock */
void patchDefault(void* e) { ammo_apply_preset(e, presetIndex("First light")); set(e, "sync", -1, 1); }
void patchFull(void* e) // 16 arps, every effect on, each ducked by channel 1
{
    ammo_apply_preset(e, 0);
    for(int s = 0; s < AMMO_SLOTS; s++)
    {
        set(e, "gen", s, 1); set(e, "arp_div", s, 11); // 1/16
        set(e, "fx_drive", s, 0.5f); set(e, "cho_on", s, 1); set(e, "cho_mix", s, 0.5f);
        set(e, "dly_mix", s, 0.4f); set(e, "dly_fb", s, 0.5f); set(e, "rev_send", s, 0.4f);
        if(s) { set(e, "duck_src", s, 1); set(e, "duck_amt", s, 0.5f); }
    }
    set(e, "sync", -1, 1);
}
void patchChords(void* e) // 16 chord channels, 9ths in steps
{
    ammo_apply_preset(e, 0);
    for(int s = 0; s < AMMO_SLOTS; s++) { set(e, "gen", s, 2); set(e, "chord_notes", s, 2); set(e, "chord_rhythm", s, 1); }
    set(e, "sync", -1, 1);
}

/* ---------------------------------------------------------------- the fastest cores */
std::vector<int> bigCores()
{
    std::vector<int> out;
    long best = 0, n = sysconf(_SC_NPROCESSORS_CONF);
    std::vector<long> f((size_t)n, 0);
    for(int c = 0; c < n; c++)
    {
        char path[96];
        std::snprintf(path, sizeof path, "/sys/devices/system/cpu/cpu%d/cpufreq/cpuinfo_max_freq", c);
        if(FILE* fp = std::fopen(path, "r")) { if(std::fscanf(fp, "%ld", &f[(size_t)c]) != 1) f[(size_t)c] = 0; std::fclose(fp); }
        if(f[(size_t)c] > best) best = f[(size_t)c];
    }
    for(int c = 0; c < n; c++) if(best && f[(size_t)c] == best) out.push_back(c);
    return out;
}
std::string pinToBigCores()
{
    std::vector<int> cs = bigCores();
    if(cs.empty()) return "unpinned (no cpufreq)";
    cpu_set_t set; CPU_ZERO(&set);
    std::string s = "cpu";
    for(int c : cs) { CPU_SET(c, &set); s += " " + std::to_string(c); }
    return sched_setaffinity(0, sizeof set, &set) == 0 ? s : "unpinned (" + std::string(std::strerror(errno)) + ")";
}

/* ---------------------------------------------------------------- playing */
class Player : public oboe::AudioStreamDataCallback, public oboe::AudioStreamErrorCallback
{
public:
    std::string start()
    {
        std::lock_guard<std::mutex> lk(mu_);
        if(stream_) return describe();
        oboe::AudioStreamBuilder b;
        b.setDirection(oboe::Direction::Output)
            ->setPerformanceMode(oboe::PerformanceMode::LowLatency)
            ->setSharingMode(oboe::SharingMode::Exclusive)
            ->setFormat(oboe::AudioFormat::Float)
            ->setChannelCount(2)
            ->setUsage(oboe::Usage::Media)
            ->setDataCallback(this)
            ->setErrorCallback(this);
        oboe::Result r = b.openStream(stream_);
        if(r != oboe::Result::OK) { stream_.reset(); return std::string("open failed: ") + oboe::convertToText(r); }
        rate_ = stream_->getSampleRate();
        if(!engine_) { engine_ = ammo_create(rate_, kMaxBlock); patchDefault(engine_); }
        L_.assign(kMaxBlock, 0.f); R_.assign(kMaxBlock, 0.f);
        pinned_ = false; resetStats();
        t0_ = Clock::now();
        r = stream_->requestStart();
        if(r != oboe::Result::OK) { stream_->close(); stream_.reset(); return std::string("start failed: ") + oboe::convertToText(r); }
        LOG("playing: %s", describe().c_str());
        return describe();
    }
    void stop()
    {
        std::lock_guard<std::mutex> lk(mu_);
        if(!stream_) return;
        stream_->stop(); stream_->close(); stream_.reset();
        LOG("stopped");
    }
    std::string status()
    {
        std::lock_guard<std::mutex> lk(mu_);
        if(!stream_) return "stopped";
        auto x = stream_->getXRunCount();
        char buf[320];
        std::snprintf(buf, sizeof buf, "%s\nplaying %.0f s  callbacks %u  frames/callback %d\nload mean %.1f %%  worst %.1f %% (last second)  worst %.1f %% (since start)\nxruns %d  core %s",
                      describe().c_str(), std::chrono::duration<double>(Clock::now() - t0_).count(), calls_.load(), lastFrames_.load(),
                      100.0 * meanShown_.load(), 100.0 * worstShown_.load(), 100.0 * worstEver_.load(), x ? x.value() : -1, core_.c_str());
        return buf;
    }

    oboe::DataCallbackResult onAudioReady(oboe::AudioStream* s, void* data, int32_t frames) override
    {
        if(!pinned_) { core_ = pinToBigCores(); pinned_ = true; }
        const auto t0 = Clock::now();
        float* out = static_cast<float*>(data);
        for(int done = 0; done < frames;)
        {
            const int n = frames - done < kMaxBlock ? frames - done : kMaxBlock;
            ammo_process(engine_, L_.data(), R_.data(), n, nullptr);
            for(int i = 0; i < n; i++) { out[2 * (done + i)] = L_[(size_t)i]; out[2 * (done + i) + 1] = R_[(size_t)i]; }
            done += n;
        }
        const double used = std::chrono::duration<double>(Clock::now() - t0).count(), had = (double)frames / rate_;
        const double load = used / had;
        calls_++; lastFrames_ = frames;
        winSum_ += load; winN_++; if(load > winWorst_) winWorst_ = load;
        if(load > worstEver_.load() && calls_ > 50) worstEver_ = load; // past the start-up
        winFrames_ += frames;
        if(winFrames_ >= rate_) { meanShown_ = winSum_ / winN_; worstShown_ = winWorst_; winSum_ = 0; winN_ = 0; winWorst_ = 0; winFrames_ = 0; }
        (void)s;
        return oboe::DataCallbackResult::Continue;
    }
    // the device changed or went away: open again on whatever is there now
    void onErrorAfterClose(oboe::AudioStream*, oboe::Result r) override
    {
        LOG("stream closed (%s): reopening", oboe::convertToText(r));
        { std::lock_guard<std::mutex> lk(mu_); stream_.reset(); }
        start();
    }

private:
    std::string describe() const
    {
        if(!stream_) return "stopped";
        char buf[256];
        std::snprintf(buf, sizeof buf, "%s %d Hz, burst %d, buffer %d frames (%.1f ms), %s, %s",
                      stream_->getAudioApi() == oboe::AudioApi::AAudio ? "AAudio" : "OpenSL ES", stream_->getSampleRate(),
                      stream_->getFramesPerBurst(), stream_->getBufferSizeInFrames(), 1000.0 * stream_->getBufferSizeInFrames() / stream_->getSampleRate(),
                      stream_->getSharingMode() == oboe::SharingMode::Exclusive ? "exclusive" : "shared",
                      stream_->getPerformanceMode() == oboe::PerformanceMode::LowLatency ? "low latency" : "not low latency");
        return buf;
    }
    void resetStats() { calls_ = 0; meanShown_ = 0; worstShown_ = 0; worstEver_ = 0; winSum_ = 0; winN_ = 0; winWorst_ = 0; winFrames_ = 0; }

    std::mutex mu_;
    std::shared_ptr<oboe::AudioStream> stream_;
    void* engine_ = nullptr;
    int rate_ = 48000;
    std::vector<float> L_, R_;
    bool pinned_ = false;
    std::string core_ = "-";
    Clock::time_point t0_;
    std::atomic<unsigned> calls_{0};
    std::atomic<int> lastFrames_{0};
    std::atomic<double> meanShown_{0}, worstShown_{0}, worstEver_{0};
    double winSum_ = 0, winWorst_ = 0; int winN_ = 0, winFrames_ = 0; // the callback's own
};
Player gPlayer;

/* ---------------------------------------------------------------- the bench */
std::string benchOne(const char* name, void (*patch)(void*))
{
    const double sr = 48000; const int block = 192, seconds = 10;
    void* e = ammo_create(sr, kMaxBlock);
    patch(e);
    std::vector<float> L(block), R(block);
    for(int i = 0; i < (int)(sr / 2) / block; i++) ammo_process(e, L.data(), R.data(), block, nullptr); // half a second in
    const int blocks = (int)(sr * seconds) / block;
    std::vector<double> d((size_t)blocks);
    const auto t0 = Clock::now();
    for(int i = 0; i < blocks; i++)
    {
        const auto b0 = Clock::now();
        ammo_process(e, L.data(), R.data(), block, nullptr);
        d[(size_t)i] = std::chrono::duration<double>(Clock::now() - b0).count();
    }
    const double t = std::chrono::duration<double>(Clock::now() - t0).count(), had = block / sr;
    int over50 = 0, over100 = 0;
    for(double x : d) { if(x > had / 2) over50++; if(x > had) over100++; }
    std::sort(d.begin(), d.end());
    const double p999 = d[(size_t)(blocks * 0.999)], worst = d.back();
    AmmoFrame f; ammo_read_frame(e, &f);
    int chans = 0, voices = 0;
    for(int s = 0; s < AMMO_SLOTS; s++) if(f.ch[s].active) { chans++; voices += f.ch[s].voices; }
    ammo_destroy(e);
    char buf[320];
    std::snprintf(buf, sizeof buf, "%-22s %5.0f ms per 10 s = %4.1f %% of real time; per %.0f-frame block (%.2f ms): 99.9th %% %.0f %%, worst %.0f %%, "
                  "%d of %d over 50 %%, %d over 100 %%; %d channels, %d voices sounding",
                  name, 1000 * t, 100 * t / seconds, (double)block, 1000 * had, 100 * p999 / had, 100 * worst / had, over50, blocks, over100, chans, voices);
    LOG("bench %s", buf);
    return buf;
}

} // namespace

extern "C" {
JNIEXPORT jstring JNICALL Java_com_ammonite_mini_Native_start(JNIEnv* env, jclass) { return env->NewStringUTF(gPlayer.start().c_str()); }
JNIEXPORT void JNICALL Java_com_ammonite_mini_Native_stop(JNIEnv*, jclass) { gPlayer.stop(); }
JNIEXPORT jstring JNICALL Java_com_ammonite_mini_Native_status(JNIEnv* env, jclass) { return env->NewStringUTF(gPlayer.status().c_str()); }
JNIEXPORT jstring JNICALL Java_com_ammonite_mini_Native_bench(JNIEnv* env, jclass)
{
    // 5 s first: just after an install and a launch the system is still busy with the app (its spikes are not ours)
    std::this_thread::sleep_for(std::chrono::seconds(5));
    std::string out = "bench on " + pinToBigCores() + ", 48 kHz, 192-frame blocks, " + ammo_version() + "\n";
    out += benchOne("default (First light)", patchDefault) + "\n";
    out += benchOne("16 ch, every effect", patchFull) + "\n";
    out += benchOne("16 chord channels", patchChords) + "\n";
    out += benchOne("default, again", patchDefault);
    return env->NewStringUTF(out.c_str());
}
}
