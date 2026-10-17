package com.duresssecurity.app

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.WindowManager
import com.duresssecurity.admin.SecureStorage
import com.duresssecurity.admin.SecurityAdminPlugin
import com.duresssecurity.admin.SecurityIntegrityPlugin
import com.getcapacitor.BridgeActivity
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicBoolean

/** Capacitor MainActivity with native security bridge and non-blocking secure-store warmup. */
class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(SecurityAdminPlugin::class.java)
        registerPlugin(SecurityIntegrityPlugin::class.java)
        super.onCreate(savedInstanceState)

        if (SECURE_WARMUP_STARTED.compareAndSet(false, true)) {
            Thread({
                try { SecureStorage(applicationContext).initializeForApp() }
                catch (_: Exception) { SECURE_WARMUP_STARTED.set(false) }
            }, "DuressSecureWarmup").apply { isDaemon = true }.start()
        }

        // Fail closed until the WebView reports that the calculator facade is visible.
        setScreenCaptureAllowed(false)
        // Keep Android's real Keyguard in charge. The app must not show its
        // maintenance/calculator UI over the system lock screen or wake the
        // device automatically; DevicePolicyManager.lockNow() performs an
        // explicit device-lock request only after the owner enabled Device Admin.
        deliverOwnerPinAction(intent)
        deliverAppLockBiometricTarget(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        deliverOwnerPinAction(intent)
        deliverAppLockBiometricTarget(intent)
    }

    private var pendingOwnerPinAction: String? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    private fun deliverOwnerPinAction(source: Intent?) {
        val pin = source?.getStringExtra(EXTRA_OWNER_PIN_ACTION)?.takeIf { it.isNotBlank() } ?: return
        source.removeExtra(EXTRA_OWNER_PIN_ACTION)
        source.removeExtra(EXTRA_OWNER_PIN_TARGET_PACKAGE)
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
        webView.evaluateJavascript(script, null)
        pendingOwnerPinAction = null
    }

    private var pendingAppLockBiometricTarget: String? = null

    private fun deliverAppLockBiometricTarget(source: Intent?) {
        val target = source?.getStringExtra(EXTRA_APP_LOCK_BIOMETRIC_TARGET)?.takeIf { it.isNotBlank() } ?: return
        source.removeExtra(EXTRA_APP_LOCK_BIOMETRIC_TARGET)
        pendingAppLockBiometricTarget = target
        dispatchPendingAppLockBiometricTarget(0)
    }

    private fun dispatchPendingAppLockBiometricTarget(attempt: Int) {
        val target = pendingAppLockBiometricTarget ?: return
        val webView = bridge?.webView
        if (webView == null || webView.url.isNullOrBlank() || webView.url == "about:blank") {
            if (attempt < 40) mainHandler.postDelayed({ dispatchPendingAppLockBiometricTarget(attempt + 1) }, 250L)
            return
        }
        val quotedTarget = JSONObject.quote(target)
        val script = "(function(targetPackage) { var handler = window.__duressSecurityHandleAppLockBiometric; if (typeof handler === 'function') { window.__duressSecurityPendingAppLockBiometricTarget = undefined; handler(targetPackage); return 'handled'; } window.__duressSecurityPendingAppLockBiometricTarget = targetPackage; return 'pending'; })($quotedTarget);"
        webView.evaluateJavascript(script, null)
        pendingAppLockBiometricTarget = null
    }

    fun setScreenCaptureAllowed(allowed: Boolean) { if (allowed) window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE) else window.addFlags(WindowManager.LayoutParams.FLAG_SECURE) }

    override fun onResume() {
        super.onResume()
        setScreenCaptureAllowed(false)
        try {
            bridge?.webView?.post {
                bridge?.webView?.evaluateJavascript("window.dispatchEvent(new Event('duress-security-native-foreground'))", null)
            }
        } catch (_: Exception) { }
    }

    override fun onPause() {
        setScreenCaptureAllowed(false)
        super.onPause()
    }

    override fun onStop() {
        setScreenCaptureAllowed(false)
        try { bridge?.webView?.post { bridge?.webView?.evaluateJavascript("window.dispatchEvent(new Event('duress-security-native-background'))", null) } } catch (_: Exception) { }
        super.onStop()
    }

    companion object {
        const val EXTRA_OWNER_PIN_ACTION = "duress-security-owner-pin-action"
        const val EXTRA_OWNER_PIN_TARGET_PACKAGE = "duress-security-owner-pin-target-package"
        const val EXTRA_APP_LOCK_BIOMETRIC_TARGET = "duress-security-app-lock-biometric-target"
        private val SECURE_WARMUP_STARTED = AtomicBoolean(false)
    }
}
