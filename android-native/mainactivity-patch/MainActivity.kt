package com.duresssecurity.app // match whatever applicationId `npx cap add android` used

import android.os.Build
import android.os.Bundle
import com.duresssecurity.admin.SecurityAdminPlugin
import com.getcapacitor.BridgeActivity

/**
 * Replace android/app/src/main/java/.../MainActivity.kt (the one `npx cap add
 * android` generated) with this version — it is identical to the default
 * Capacitor MainActivity, plus:
 *
 *  1. registerPlugin(SecurityAdminPlugin::class.java) so the web code's
 *     `native-bridge.ts` can reach it.
 *  2. setShowWhenLocked(true) + setTurnScreenOn(true) to request that the
 *     activity be shown when the display turns on. OEM and Android-version
 *     behavior varies; this does not make the activity the system keyguard.
 *
 * Important, honest limits (do not remove this comment when you read it):
 *  - These flags do not read, replace, or dismiss a secure Android Keyguard.
 *    The OS continues to control its PIN/pattern/password verification, and
 *    may keep its lock screen in front of this activity. This app cannot
 *    change that and does not try to.
 *  - This is cosmetic placement, not a security boundary: it does not
 *    protect data by itself. The PIN logic in `security-service.ts` is what
 *    actually gates the app.
 */
class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(SecurityAdminPlugin::class.java)
        super.onCreate(savedInstanceState)

        // Do not expose PINs or vault contents to screenshots / non-secure displays.
        window.setFlags(
            android.view.WindowManager.LayoutParams.FLAG_SECURE,
            android.view.WindowManager.LayoutParams.FLAG_SECURE,
        )

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
}
