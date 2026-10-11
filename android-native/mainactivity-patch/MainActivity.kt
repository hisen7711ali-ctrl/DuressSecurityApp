package com.duresssecurity.app

import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import com.duresssecurity.admin.SecurityAdminPlugin
import com.getcapacitor.BridgeActivity

/**
 * Capacitor MainActivity with the native security bridge.
 * The app-level PIN gate remains separate from Android's system Keyguard.
 * Screenshots are explicitly allowed in calculator and security/settings screens.
 */
class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(SecurityAdminPlugin::class.java)
        super.onCreate(savedInstanceState)

        // Never apply FLAG_SECURE: the user must be able to capture screenshots
        // of the calculator, security workspace and settings for documentation/testing.
        window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)

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
