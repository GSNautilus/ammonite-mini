package com.ammonite.mini

import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/** Phase 1: no page yet. The default preset plays on launch; Bench renders offline and reports the times.
 *  From adb: am start -n com.ammonite.mini/.MainActivity --ez bench true (bench at launch; results in logcat,
 *  tag AmmoMini), --ez play false (do not start playing). */
class MainActivity : Activity() {
    private val ui = Handler(Looper.getMainLooper())
    private lateinit var status: TextView
    private lateinit var bench: TextView
    private var benching = false

    override fun onCreate(saved: Bundle?) {
        super.onCreate(saved)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) // no foreground service until phase 4
        val mono = Typeface.MONOSPACE
        status = TextView(this).apply { typeface = mono; textSize = 15f; setTextColor(Color.rgb(236, 236, 240)) }
        bench = TextView(this).apply { typeface = mono; textSize = 15f; setTextColor(Color.rgb(239, 230, 216)); setPadding(0, 32, 0, 0) }
        fun button(label: String, act: () -> Unit) = Button(this).apply { text = label; textSize = 18f; setOnClickListener { act() } }
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            addView(button("Play") { status.text = Native.start() })
            addView(button("Stop") { Native.stop() })
            addView(button("Bench") { runBench() })
        }
        setContentView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.rgb(14, 14, 16))
            setPadding(48, 48, 48, 48)
            addView(TextView(this@MainActivity).apply { text = "AMMONITE MINI  ·  phase 1"; textSize = 20f; setTextColor(Color.rgb(239, 230, 216)) })
            addView(row)
            addView(status)
            addView(bench)
        })
        if (intent.getBooleanExtra("bench", false)) runBench()
        else if (intent.getBooleanExtra("play", true)) status.text = Native.start()
        ui.post(object : Runnable {
            var ticks = 0
            override fun run() {
                if (!benching) {
                    status.text = Native.status()
                    if (++ticks % 60 == 0) Log.i("AmmoMini", "status " + status.text.toString().replace("\n", " | ")) // every 30 s
                }
                ui.postDelayed(this, 500)
            }
        })
    }

    /** Stops playing (the bench wants the big cores to itself), renders, plays again. */
    private fun runBench() {
        if (benching) return
        benching = true
        Native.stop()
        status.text = "bench running (about a minute)..."
        bench.text = ""
        Thread {
            val r = Native.bench()
            Log.i("AmmoMini", "bench done")
            ui.post { bench.text = r; benching = false; Native.start() }
        }.start()
    }

    override fun onDestroy() {
        Native.stop()
        super.onDestroy()
    }
}
