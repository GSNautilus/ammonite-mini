/* The C API of Ammonite Mini's bridge (Bridge.hpp): what tests/bridge (ctypes) and the app's JNI glue call. */
#ifndef AMMONITE_BRIDGE_API_H
#define AMMONITE_BRIDGE_API_H

#include "api.h"

#ifdef __cplusplus
extern "C" {
#endif

/* AmmoBridgeHost: Bridge.hpp */
typedef struct AmmoBridgeHost AmmoBridgeHost;

AMMO_API void* ammo_bridge_create(void* engine, const AmmoBridgeHost* host, const char* recordDir);
AMMO_API void  ammo_bridge_destroy(void* bridge);
AMMO_API void  ammo_bridge_message(void* bridge, const char* msg);  /* a line from the page */
AMMO_API void  ammo_bridge_tick(void* bridge);                      /* once per display frame */
AMMO_API int   ammo_bridge_playing(void* bridge);                   /* the transport: the audio callback reads it */
AMMO_API int   ammo_bridge_patch_text(void* bridge, char* buf, int cap); /* its length; buf (if any) NUL-terminated */
AMMO_API void  ammo_bridge_saved(void* bridge, const char* name, int ok); /* after a Save picker; "" = cancelled */
AMMO_API void  ammo_bridge_opened(void* bridge, const char* name, const char* text, int len); /* after an Open picker */

#ifdef __cplusplus
}
#endif

#endif /* AMMONITE_BRIDGE_API_H */
