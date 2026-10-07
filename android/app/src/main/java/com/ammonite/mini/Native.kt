package com.ammonite.mini

/** The native library (app/src/main/cpp/mini.cpp): the engine through Oboe, the bridge to the page, the bench. */
object Native {
    init { System.loadLibrary("ammonite_mini") }

    /** What the bridge asks of the app; called back on the UI thread, during message / tick / saved / opened. */
    interface Host {
        fun eval(js: String)
        fun pick(save: Boolean, suggestedName: String)
        fun recorded(path: String, ok: Boolean)
    }

    /** Once per process: the engine, the bridge on it, and where recordings go. */
    @JvmStatic external fun create(host: Host, recordDir: String)
    /** A new activity's host (the old one went with its activity). */
    @JvmStatic external fun setHost(host: Host)
    /** A line from the page (WebMessageListener). */
    @JvmStatic external fun message(msg: String)
    /** Once per display frame: the telemetry since the last, to the page. */
    @JvmStatic external fun tick()
    /** After a Save picker: what to write, then saved(name, ok). */
    @JvmStatic external fun patchText(): ByteArray
    @JvmStatic external fun saved(name: String, ok: Boolean)
    /** After an Open picker: the file's name and bytes. */
    @JvmStatic external fun opened(name: String, text: ByteArray?)

    @JvmStatic external fun start(): String
    @JvmStatic external fun stop()
    @JvmStatic external fun status(): String
    @JvmStatic external fun bench(): String
    /** What the engine starts with (before create): 0 the default preset, 1 the bench's 16 channels with every
     *  effect, 2 its 16 chord channels. */
    @JvmStatic external fun setPatch(k: Int)
    /** Android's performance hint on the audio callback (on unless told otherwise; before the first start). */
    @JvmStatic external fun setHint(on: Boolean)
}
