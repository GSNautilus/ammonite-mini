package com.ammonite.mini

import android.app.Activity
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.provider.OpenableColumns
import android.util.Log
import android.view.Choreographer
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import java.io.File

/** The app: the page (web/) full screen in a WebView, the engine and the bridge behind it (Native).
 *
 *  - The page: from the APK's assets (Gradle reads web/ itself), served as https://appassets.androidplatform.net,
 *    or, while developing, from the PC: am start ... --es url http://<PC>:8010/index.html (mini.ps1 run -Dev)
 *    is kept until --es url "" puts the assets back. Page edits then need a reload, not a reinstall.
 *  - Page -> native: a WebMessageListener injects `ammoHost` (app.js uses it as its bridge); native -> page:
 *    evaluateJavascript. Ticks: one per display frame (Choreographer), sent only when the engine has published.
 *  - Patch files: Android's pickers (Save: ACTION_CREATE_DOCUMENT, Open: ACTION_OPEN_DOCUMENT).
 *  - Recordings: the app's own Music folder (phase 3 copies them out).
 *  - adb extras for the bench: --ez bench true (results in logcat, tag AmmoMini), --ei patch 1|2, --ez hint false,
 *    --ez exclusive true (an exclusive stream: silent on the SM-P620). */
class MainActivity : Activity(), Native.Host {
    private lateinit var web: WebView
    private var ticking = false
    private var lastStatus = 0L
    private val frame = object : Choreographer.FrameCallback {
        override fun doFrame(frameTimeNanos: Long) {
            Native.tick()
            if (frameTimeNanos - lastStatus > 30_000_000_000L) { // the audio's load and dropouts, every 30 s
                lastStatus = frameTimeNanos
                Log.i(TAG, "status " + Native.status().replace("\n", " | "))
            }
            if (ticking) Choreographer.getInstance().postFrameCallback(this)
        }
    }

    override fun onCreate(saved: Bundle?) {
        super.onCreate(saved)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) // no foreground service until phase 4
        Native.setPatch(intent.getIntExtra("patch", 0))
        Native.setHint(intent.getBooleanExtra("hint", true))
        Native.setExclusive(intent.getBooleanExtra("exclusive", false)) // exclusive (MMAP) plays silence on this tablet
        val recordings = File(getExternalFilesDir(Environment.DIRECTORY_MUSIC), "Recordings").apply { mkdirs() }
        Native.create(this, recordings.path)
        Native.setHost(this)

        val debuggable = applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0
        WebView.setWebContentsDebuggingEnabled(debuggable) // chrome://inspect on the PC
        val assets = WebViewAssetLoader.Builder().addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this)).build()
        web = WebView(this).apply {
            setBackgroundColor(Color.rgb(14, 14, 16))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true // the page keeps its own state in localStorage
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                    assets.shouldInterceptRequest(request.url)
            }
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, "ammoHost", setOf("*")) { _, message, _, _, _ ->
                message.data?.let { Native.message(it) }
            }
        } else Log.e(TAG, "this WebView has no WebMessageListener: the page cannot talk to the engine")
        setContentView(web)
        window.insetsController?.let {
            it.hide(WindowInsets.Type.systemBars())
            it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
        web.loadUrl(pageUrl())

        if (intent.getBooleanExtra("bench", false)) bench() else Log.i(TAG, Native.start())
    }

    /** The development URL if one was given (and kept), else the page from the assets. */
    private fun pageUrl(): String {
        val prefs = getSharedPreferences("dev", MODE_PRIVATE)
        intent.getStringExtra("url")?.let { prefs.edit().putString("url", it).apply() }
        val dev = prefs.getString("url", "") ?: ""
        val url = if (dev.isNotEmpty()) dev else "https://appassets.androidplatform.net/assets/index.html"
        Log.i(TAG, "page: $url")
        return url
    }

    override fun onResume() {
        super.onResume()
        if (!ticking) { ticking = true; Choreographer.getInstance().postFrameCallback(frame) }
    }

    override fun onPause() {
        ticking = false
        Choreographer.getInstance().removeFrameCallback(frame)
        super.onPause()
    }

    override fun onDestroy() {
        if (isFinishing) Native.stop()
        web.destroy()
        super.onDestroy()
    }

    /* ---- Native.Host */
    override fun eval(js: String) = web.evaluateJavascript(js, null)

    override fun pick(save: Boolean, suggestedName: String) {
        val i = Intent(if (save) Intent.ACTION_CREATE_DOCUMENT else Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
        if (save) i.setType("application/octet-stream").putExtra(Intent.EXTRA_TITLE, suggestedName) else i.setType("*/*")
        startActivityForResult(i, if (save) PICK_SAVE else PICK_OPEN)
    }

    override fun recorded(path: String, ok: Boolean) {
        Log.i(TAG, "recorded $path ($ok)")
    }

    @Deprecated("Activity's own; the app has no androidx.activity")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        val uri = if (resultCode == RESULT_OK) data?.data else null
        when (requestCode) {
            PICK_SAVE -> {
                if (uri == null) { Native.saved("", false); return }
                val ok = try {
                    contentResolver.openOutputStream(uri, "wt")?.use { it.write(Native.patchText()) } != null
                } catch (e: Exception) { Log.e(TAG, "save failed", e); false }
                Native.saved(nameOf(uri), ok)
            }
            PICK_OPEN -> {
                if (uri == null) return
                val bytes = try { contentResolver.openInputStream(uri)?.use { it.readBytes() } } catch (e: Exception) { Log.e(TAG, "open failed", e); null }
                Native.opened(nameOf(uri), bytes)
            }
        }
    }

    private fun nameOf(uri: Uri): String =
        contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use {
            if (it.moveToFirst()) it.getString(0) else null
        } ?: uri.lastPathSegment ?: "patch.ammo"

    /** The bench (phase 1): stops playing, renders offline on a thread, plays again; results in logcat. */
    private fun bench() {
        Native.stop()
        Toast.makeText(this, "Bench running (about a minute)", Toast.LENGTH_LONG).show()
        Thread {
            Native.bench()
            Log.i(TAG, "bench done")
            runOnUiThread { Log.i(TAG, Native.start()) }
        }.start()
    }

    companion object {
        const val TAG = "AmmoMini"
        const val PICK_SAVE = 1
        const val PICK_OPEN = 2
    }
}
