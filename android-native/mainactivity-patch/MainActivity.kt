package com.duresssecurity.app

import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import com.duresssecurity.admin.SecurityAdminPlugin
import com.getcapacitor.BridgeActivity

/**
 * Capacitor MainActivity with the native security bridge.
 * The app-level PIN gate remains separate from Android's system Keyguard.
 * FLAG_SECURE is always enabled on the native app window so protected UI/data
 * cannot be captured by Android screenshots or normal screen-recording APIs.
 */
class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(SecurityAdminPlugin::class.java)
        super.onCreate(savedInstanceState)

        // Security-first: the native app window is never capturable. The calculator
        // remains a normal decoy UI, but its contents are not exported to screenshots.
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)

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

    override fun onStop() {
        try {
            bridge?.webView?.post {
                bridge?.webView?.evaluateJavascript(
                    "window.dispatchEvent(new Event('duress-security-native-background'))",
                    null,
                )
            }
        } catch (_: Exception) {
            // The next process start restores the persisted locked session.
        }
        super.onStop()
    }
}
