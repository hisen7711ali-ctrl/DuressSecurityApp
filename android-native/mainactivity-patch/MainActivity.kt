package com.duresssecurity.app

import android.os.Bundle
import android.view.WindowManager
import com.duresssecurity.admin.SecureStorage
import com.duresssecurity.admin.SecurityAdminPlugin
import com.getcapacitor.BridgeActivity
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
    }

    fun setScreenCaptureAllowed(allowed: Boolean) { if (allowed) window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE) else window.addFlags(WindowManager.LayoutParams.FLAG_SECURE) }

    override fun onStop() {
        setScreenCaptureAllowed(false)
        try { bridge?.webView?.post { bridge?.webView?.evaluateJavascript("window.dispatchEvent(new Event('duress-security-native-background'))", null) } } catch (_: Exception) { }
        super.onStop()
    }

    companion object {
        private val SECURE_WARMUP_STARTED = AtomicBoolean(false)
    }
}
