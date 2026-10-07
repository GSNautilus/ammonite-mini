/** The bridge's C API (bridge_api.h): in the Windows DLL with the engine's, for tests/bridge; in the app's
 *  native library for the JNI glue. The engine handle is ammo_create's. */
#define AMMO_BUILD_DLL
#include "bridge_api.h"

#include "Bridge.hpp"

#include <cstring>

namespace
{
ammo::Bridge* B(void* p) { return static_cast<ammo::Bridge*>(p); }
}

extern "C" {

AMMO_API void* ammo_bridge_create(void* engine, const AmmoBridgeHost* host, const char* recordDir)
{
    if(engine == nullptr || host == nullptr)
        return nullptr;
    return new ammo::Bridge(*static_cast<ammo::Engine*>(engine), *host, recordDir ? recordDir : "");
}

AMMO_API void ammo_bridge_destroy(void* bridge) { delete B(bridge); }
AMMO_API void ammo_bridge_message(void* bridge, const char* msg) { if(msg) B(bridge)->OnMessage(msg); }
AMMO_API void ammo_bridge_tick(void* bridge) { B(bridge)->Tick(); }
AMMO_API int  ammo_bridge_playing(void* bridge) { return B(bridge)->Playing() ? 1 : 0; }

AMMO_API int ammo_bridge_patch_text(void* bridge, char* buf, int cap)
{
    const std::string t = B(bridge)->PatchText();
    if(buf != nullptr && cap > 0)
    {
        const size_t n = t.size() < (size_t)cap - 1 ? t.size() : (size_t)cap - 1;
        std::memcpy(buf, t.data(), n);
        buf[n] = 0;
    }
    return (int)t.size();
}

AMMO_API void ammo_bridge_saved(void* bridge, const char* name, int ok) { B(bridge)->Saved(name ? name : "", ok != 0); }

AMMO_API void ammo_bridge_opened(void* bridge, const char* name, const char* text, int len)
{
    B(bridge)->Opened(name ? name : "", text, text != nullptr && len > 0 ? (size_t)len : 0);
}

} // extern "C"
