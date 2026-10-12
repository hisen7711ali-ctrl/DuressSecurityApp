package com.duresssecurity.app

import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import com.duresssecurity.admin.SecurityAdminPlugin
import com.getcapacitor.BridgeActivity

/**
 * Capacitor MainActivity with the native security bridge.
 * The decoy calculator is intentionally capturable; protected Duress Security UI is not.
 */
class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(SecurityAdminPlugin::class.java)
        super.onCreate(savedInstanceState)

        // Start in decoy/calculator mode. AppShell switches FLAG_SECURE on as soon as
        // the protected UI is shown, and switches it back off when the decoy returns.
        setScreenCaptureAllowed(true)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON,
            )
        }
    }

    /** true = normal calculator/decoy may be captured; false = protected UI is secure. */
    fun setScreenCaptureAllowed(allowed: Boolean) {
        if (allowed) {
            window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        } else {
            window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }
    }

    override fun onStop() {
        // Never leave a protected window capturable while the app is backgrounded.
        setScreenCaptureAllowed(false)
        try {
            bridge?.webView?.post {
                bridge?.webView?.evaluateJavascript(
                    "window.dispatchEvent(new Event('duress-security-native-background'))",
                    null,
                )
            }
        } catch (_: Exception) {
            // The next process start restores the locked session.
        }
        super.onStop()
    }
}
