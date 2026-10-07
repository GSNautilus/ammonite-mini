package com.ammonite.mini

/** The native library (app/src/main/cpp/mini.cpp): the engine through Oboe, and the bench. */
object Native {
    init { System.loadLibrary("ammonite_mini") }
    @JvmStatic external fun start(): String
    @JvmStatic external fun stop()
    /** What Play plays (before the first): 0 the default preset, 1 the bench's 16 channels with every effect, 2 its 16 chord channels. */
    @JvmStatic external fun setPatch(k: Int)
    /** Android's performance hint on the audio callback (on unless told otherwise; before the first Play). */
    @JvmStatic external fun setHint(on: Boolean)
    @JvmStatic external fun status(): String
    @JvmStatic external fun bench(): String
}
