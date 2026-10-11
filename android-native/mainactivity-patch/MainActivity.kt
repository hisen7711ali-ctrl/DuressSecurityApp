package com.duresssecurity.app // match whatever applicationId `npx cap add android` used

import android.os.Build
import android.os.Bundle
import com.duresssecurity.admin.SecurityAdminPlugin
import com.getcapacitor.BridgeActivity

/**
 * Capacitor MainActivity with the native security bridge.
 * The app-level PIN gate remains separate from Android's system Keyguard.
 *
 * Screenshot capture is intentionally allowed. The security model protects
 * access with the app PIN and Android permissions rather than globally blocking
 * the user's normal screenshot function.
 */
class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(SecurityAdminPlugin::class.java)
        super.onCreate(savedInstanceState)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON,
            )
        }
    }

    override fun onStop() {
        // Tell the WebView to persist the app-level lock before this Activity is
        // fully backgrounded. This complements visibilitychange and covers OEMs
        // where WebView visibility events are delayed or omitted on screen-off.
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
