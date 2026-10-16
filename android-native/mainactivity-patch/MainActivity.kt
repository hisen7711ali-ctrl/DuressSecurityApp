package com.duresssecurity.app

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.WindowManager
import com.duresssecurity.admin.SecureStorage
import com.duresssecurity.admin.SecurityAdminPlugin
import com.getcapacitor.BridgeActivity
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicBoolean

/** Capacitor MainActivity with native security bridge and non-blocking secure-store warmup. */
class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(SecurityAdminPlugin::class.java)
        super.onCreate(savedInstanceState)

        // Warm the Keystore and device-bound vault secret before JavaScript asks for them.
        // This is deliberately detached from the UI thread and deduplicated across activity
        // recreation; slow OEM Keystore initialization must never replace the calculator decoy.
        if (SECURE_WARMUP_STARTED.compareAndSet(false, true)) {
            Thread({
                try { SecureStorage(applicationContext).initializeForApp() }
                catch (_: Exception) { SECURE_WARMUP_STARTED.set(false) }
            }, "DuressSecureWarmup").apply { isDaemon = true }.start()
        }

        setScreenCaptureAllowed(true)
        // Keep Android's real Keyguard in charge. The app must not show its
        // maintenance/calculator UI over the system lock screen or wake the
        // device automatically; DevicePolicyManager.lockNow() performs an
        // explicit device-lock request only after the owner enabled Device Admin.
        deliverOwnerPinAction(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        deliverOwnerPinAction(intent)
    }

    private var pendingOwnerPinAction: String? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    private fun deliverOwnerPinAction(source: Intent?) {
        val pin = source?.getStringExtra(EXTRA_OWNER_PIN_ACTION)?.takeIf { it.isNotBlank() } ?: return
        source.removeExtra(EXTRA_OWNER_PIN_ACTION)
        pendingOwnerPinAction = pin
        dispatchPendingOwnerPinAction(0)
    }

    private fun dispatchPendingOwnerPinAction(attempt: Int) {
        val pin = pendingOwnerPinAction ?: return
        val webView = bridge?.webView
        if (webView == null || webView.url.isNullOrBlank() || webView.url == "about:blank") {
            if (attempt < 40) mainHandler.postDelayed({ dispatchPendingOwnerPinAction(attempt + 1) }, 250L)
            return
        }
        val quotedPin = JSONObject.quote(pin)
        val script = "(function(pin) { var handler = window.__duressSecurityHandlePinAction; if (typeof handler === 'function') { window.__duressSecurityPendingPinAction = undefined; handler(pin); return 'handled'; } window.__duressSecurityPendingPinAction = pin; return 'pending'; })($quotedPin);"
        // If React hasn't mounted, the PIN remains in a page-global pending slot;
        // AppShell consumes it after hydration. Do not persist PINs to disk.
        webView.evaluateJavascript(script, null)
        pendingOwnerPinAction = null
    }

    fun setScreenCaptureAllowed(allowed: Boolean) { if (allowed) window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE) else window.addFlags(WindowManager.LayoutParams.FLAG_SECURE) }

    override fun onStop() {
        setScreenCaptureAllowed(false)
        try { bridge?.webView?.post { bridge?.webView?.evaluateJavascript("window.dispatchEvent(new Event('duress-security-native-background'))", null) } } catch (_: Exception) { }
        super.onStop()
    }

    companion object {
        const val EXTRA_OWNER_PIN_ACTION = "duress-security-owner-pin-action"
        private val SECURE_WARMUP_STARTED = AtomicBoolean(false)
    }
}
