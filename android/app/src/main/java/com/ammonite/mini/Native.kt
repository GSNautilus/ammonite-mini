package com.ammonite.mini

/** The native library (app/src/main/cpp/mini.cpp): the engine through Oboe, and the bench. */
object Native {
    init { System.loadLibrary("ammonite_mini") }
    @JvmStatic external fun start(): String
    @JvmStatic external fun stop()
    @JvmStatic external fun status(): String
    @JvmStatic external fun bench(): String
}
