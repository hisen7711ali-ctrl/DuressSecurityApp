package com.duresssecurity.admin

import android.Manifest
import android.app.ActivityManager
import android.app.KeyguardManager
import android.app.AppOpsManager
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Process
import android.provider.Settings
import android.view.WindowManager
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import java.util.concurrent.Executors

@CapacitorPlugin(name = "SecurityAdmin")
class SecurityAdminPlugin : Plugin() {
    private val secureStorageExecutor = Executors.newSingleThreadExecutor { task -> Thread(task, "DuressSecureStorage").apply { isDaemon = true } }
    private fun adminComponent(): ComponentName = ComponentName(context, AdminReceiver::class.java)
    private fun dpm(): DevicePolicyManager = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    private fun secureStore() = SecureStorage(context)

    override fun handleOnDestroy() {
        secureStorageExecutor.shutdownNow()
        super.handleOnDestroy()
    }

    @PluginMethod
    fun setScreenCaptureAllowed(call: PluginCall) {
        val allowed = call.getBoolean("allowed", false) ?: false; val currentActivity = activity
        if (currentActivity == null) { call.resolve(JSObject().putCompat("ok", false)); return }
        currentActivity.runOnUiThread { try { if (allowed) currentActivity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE) else currentActivity.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE); call.resolve(JSObject().putCompat("ok", true)) } catch (_: Exception) { call.resolve(JSObject().putCompat("ok", false)) } }
    }
    @PluginMethod fun isDeviceAdminActive(call: PluginCall) { call.resolve(JSObject().putCompat("active", dpm().isAdminActive(adminComponent()))) }
    @PluginMethod
    fun requestDeviceAdmin(call: PluginCall) {
        if (dpm().isAdminActive(adminComponent())) { call.resolve(JSObject().putCompat("granted", true)); return }
        saveCall(call); val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply { putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent()); putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION, "Duress Security uses this permission only to lock the screen on request. It does not wipe the device or read the system PIN. You can revoke this permission in Android Settings.") }; startActivityForResult(call, intent, "onDeviceAdminResult")
    }
    @ActivityCallback private fun onDeviceAdminResult(call: PluginCall?) { if (call != null) call.resolve(JSObject().putCompat("granted", dpm().isAdminActive(adminComponent()))) }
    @PluginMethod
    fun setImmersiveMode(call: PluginCall) {
        val enabled = call.getBoolean("enabled", false) ?: false
        val hostActivity = activity
        if (hostActivity == null) {
            call.resolve(JSObject().putCompat("ok", false))
            return
        }
        hostActivity.runOnUiThread {
            try {
                val decor = hostActivity.window.decorView
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    val controller = hostActivity.window.insetsController
                    if (enabled) {
                        controller?.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                        controller?.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                    } else {
                        controller?.show(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                        decor.systemUiVisibility = View.SYSTEM_UI_FLAG_VISIBLE
                    }
                } else {
                    decor.systemUiVisibility = if (enabled) {
                        (View.SYSTEM_UI_FLAG_FULLSCREEN
                            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION)
                    } else {
                        View.SYSTEM_UI_FLAG_VISIBLE
                    }
                }
                call.resolve(JSObject().putCompat("ok", true))
            } catch (_: Exception) {
                call.resolve(JSObject().putCompat("ok", false))
            }
        }
    }

    @PluginMethod
    fun lockNow(call: PluginCall) { val ret = JSObject(); if (!dpm().isAdminActive(adminComponent())) { call.resolve(ret.putCompat("ok", false)); return }; try { dpm().lockNow(); ret.putCompat("ok", true) } catch (_: SecurityException) { ret.putCompat("ok", false) }; call.resolve(ret) }
    @PluginMethod fun isBiometricAvailable(call: PluginCall) { call.resolve(JSObject().putCompat("available", biometricAvailable())) }
    private fun biometricAvailable(): Boolean = BiometricManager.from(context).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG) == BiometricManager.BIOMETRIC_SUCCESS
    @PluginMethod
    fun authenticateBiometric(call: PluginCall) {
        val fragmentActivity = activity as? androidx.fragment.app.FragmentActivity; if (fragmentActivity == null) { call.resolve(JSObject().putCompat("success", false)); return }
        val reason = call.getString("reason") ?: "Unlock Duress Security"; val executor = ContextCompat.getMainExecutor(context)
        val prompt = BiometricPrompt(fragmentActivity, executor, object : BiometricPrompt.AuthenticationCallback() { override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) { call.resolve(JSObject().putCompat("success", true)) }; override fun onAuthenticationError(errorCode: Int, errString: CharSequence) { call.resolve(JSObject().putCompat("success", false)) }; override fun onAuthenticationFailed() {} })
        val info = BiometricPrompt.PromptInfo.Builder().setTitle(reason).setSubtitle("Biometric verification can only perform the one configured biometric action.").setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG).setNegativeButtonText("Cancel").build(); fragmentActivity.runOnUiThread { prompt.authenticate(info) }
    }
    @PluginMethod
    fun listLaunchableApps(call: PluginCall) {
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER); val matches = try { if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) context.packageManager.queryIntentActivities(intent, PackageManager.ResolveInfoFlags.of(0L)) else { @Suppress("DEPRECATION") context.packageManager.queryIntentActivities(intent, 0) } } catch (_: Exception) { call.resolve(JSObject().putCompat("apps", JSArray())); return }
        val rows = JSArray(); matches.mapNotNull { info -> val packageName = info.activityInfo?.packageName ?: return@mapNotNull null; if (packageName == context.packageName) return@mapNotNull null; packageName to info.loadLabel(context.packageManager).toString() }.distinctBy { it.first }.sortedBy { it.second.lowercase() }.forEach { (packageName, label) -> rows.put(JSObject().putCompat("packageName", packageName).putCompat("label", label)) }; call.resolve(JSObject().putCompat("apps", rows))
    }
    @PluginMethod
    fun getPermissionStatus(call: PluginCall) { val ret = JSObject(); ret.putCompat("overlayPermission", hasOverlayPermission()); ret.putCompat("usagePermission", hasUsageAccess()); ret.putCompat("accessibilityPermission", isOurAccessibilityServiceEnabled()); ret.putCompat("notificationPermission", hasNotificationPermission()); ret.putCompat("autostartPermission", false); ret.putCompat("deviceAdmin", dpm().isAdminActive(adminComponent())); ret.putCompat("deviceOwner", dpm().isDeviceOwnerApp(context.packageName)); ret.putCompat("deviceSecure", (context.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager).isDeviceSecure); ret.putCompat("biometricAvailable", biometricAvailable()); ret.putCompat("preventUninstall", isSelfUninstallBlocked()); ret.putCompat("dedicatedDeviceMode", isKioskActive()); call.resolve(ret) }
    @PluginMethod
    fun requestSystemPermission(call: PluginCall) {
        val kind = call.getString("permission") ?: ""; val result = JSObject(); val intent = when (kind) {
            "overlayPermission" -> { if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) { call.resolve(result.putCompat("opened", false).putCompat("supported", false)); return }; Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}")) }
            "usagePermission" -> Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
            "accessibilityPermission" -> Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
            "notificationPermission" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName) else Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
            "autostartPermission" -> { call.resolve(result.putCompat("opened", false).putCompat("supported", false)); return }
            else -> { call.resolve(result.putCompat("opened", false).putCompat("supported", false)); return }
        }
        try { intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); context.startActivity(intent); result.putCompat("opened", true).putCompat("supported", true) } catch (_: Exception) { result.putCompat("opened", false).putCompat("supported", false) }; call.resolve(result)
    }
    @PluginMethod
    fun initializeSecureStorage(call: PluginCall) {
        secureStorageExecutor.execute {
            val ok = try { secureStore().initializeForApp() } catch (_: Exception) { false }
            call.resolve(JSObject().putCompat("ok", ok))
        }
    }
    @PluginMethod
    fun secureGet(call: PluginCall) {
        val key = call.getString("key"); if (key.isNullOrBlank()) { call.resolve(JSObject().putCompat("available", true).putCompat("found", false).putCompat("value", null)); return }
        secureStorageExecutor.execute { try { val value = secureStore().get(key); call.resolve(JSObject().putCompat("available", true).putCompat("found", value != null).putCompat("value", value).putCompat("reason", null)) } catch (error: Exception) { val chain = generateSequence(error as Throwable?) { it.cause }.toList(); val reason = when { chain.any { it.message == "SECURE_STORAGE_KEY_MISSING" } -> "KEY_MISSING"; chain.any { it.message == "SECURE_STORAGE_DEVICE_SECRET_INVALID" } -> "DEVICE_SECRET_INVALID"; chain.any { it is javax.crypto.AEADBadTagException } -> "DECRYPTION_FAILED"; chain.any { it is java.security.KeyStoreException || it is java.security.UnrecoverableKeyException } -> "KEYSTORE_ERROR"; else -> "READ_FAILED" }; call.resolve(JSObject().putCompat("available", false).putCompat("found", false).putCompat("value", null).putCompat("reason", reason)) } }
    }
    @PluginMethod
    fun secureSet(call: PluginCall) { val key = call.getString("key"); val value = call.getString("value"); if (key.isNullOrBlank() || value == null) { call.resolve(JSObject().putCompat("ok", false)); return }; secureStorageExecutor.execute { val ok = try { secureStore().put(key, value) } catch (_: Exception) { false }; call.resolve(JSObject().putCompat("ok", ok)) } }
    @PluginMethod
    fun secureRemove(call: PluginCall) { val key = call.getString("key"); if (key.isNullOrBlank()) { call.resolve(JSObject().putCompat("ok", false)); return }; secureStorageExecutor.execute { val ok = try { secureStore().remove(key) } catch (_: Exception) { false }; call.resolve(JSObject().putCompat("ok", ok)) } }
    @PluginMethod
    fun secureClearOwned(call: PluginCall) { secureStorageExecutor.execute { val ok = try { secureStore().removeOwned() } catch (_: Exception) { false }; call.resolve(JSObject().putCompat("ok", ok)) } }
    @PluginMethod
    fun completeAppLockBiometric(call: PluginCall) {
        val targetPackage = call.getString("packageName")?.takeIf { it.isNotBlank() && it != context.packageName }
        if (targetPackage == null) {
            call.resolve(JSObject().putCompat("ok", false))
            return
        }
        if (!biometricAvailable() || !isConfiguredLockedPackage(targetPackage)) {
            notifyAppLockBiometricFailed(targetPackage)
            call.resolve(JSObject().putCompat("ok", false))
            return
        }
        val fragmentActivity = activity as? androidx.fragment.app.FragmentActivity
        if (fragmentActivity == null) {
            notifyAppLockBiometricFailed(targetPackage)
            call.resolve(JSObject().putCompat("ok", false))
            return
        }
        val targetIntent = try { context.packageManager.getLaunchIntentForPackage(targetPackage) } catch (_: Exception) { null }
        if (targetIntent == null) {
            notifyAppLockBiometricFailed(targetPackage)
            call.resolve(JSObject().putCompat("ok", false))
            return
        }

        val executor = ContextCompat.getMainExecutor(context)
        val prompt = BiometricPrompt(
            fragmentActivity,
            executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    // Re-check the encrypted policy after biometric verification so a
                    // removed/disabled package cannot be unlocked by a stale prompt.
                    if (!isConfiguredLockedPackage(targetPackage)) {
                        notifyAppLockBiometricFailed(targetPackage)
                        call.resolve(JSObject().putCompat("ok", false))
                        return
                    }
                    try {
                        targetIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                        context.startActivity(targetIntent)
                        // Only release the native gate after Android accepts the target
                        // launch; a launch exception must never unlock the package.
                        context.sendBroadcast(
                            Intent(AppLockAccessibilityService.ACTION_BIOMETRIC_UNLOCKED)
                                .setPackage(context.packageName)
                                .putExtra(AppLockAccessibilityService.EXTRA_TARGET_PACKAGE, targetPackage),
                        )
                        call.resolve(JSObject().putCompat("ok", true))
                    } catch (_: Exception) {
                        notifyAppLockBiometricFailed(targetPackage)
                        call.resolve(JSObject().putCompat("ok", false))
                    }
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    notifyAppLockBiometricFailed(targetPackage)
                    call.resolve(JSObject().putCompat("ok", false))
                }

                override fun onAuthenticationFailed() {
                    // Keep the system biometric prompt open; never treat a failed scan
                    // as authorization to launch the protected app.
                }
            },
        )
        val info = BiometricPrompt.PromptInfo.Builder()
            .setTitle(if (java.util.Locale.getDefault().language.equals("ar", true)) "فتح التطبيق المحمي" else "Unlock protected app")
            .setSubtitle(if (java.util.Locale.getDefault().language.equals("ar", true)) "تحقّق بالبصمة للمتابعة" else "Verify your biometric to continue")
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
            .setNegativeButtonText(if (java.util.Locale.getDefault().language.equals("ar", true)) "إلغاء" else "Cancel")
            .build()
        fragmentActivity.runOnUiThread { prompt.authenticate(info) }
    }

    @PluginMethod
    fun cancelAppLockBiometric(call: PluginCall) {
        val targetPackage = call.getString("packageName")?.takeIf { it.isNotBlank() && it != context.packageName }
        if (targetPackage == null) {
            call.resolve(JSObject().putCompat("ok", false))
            return
        }
        notifyAppLockBiometricFailed(targetPackage)
        call.resolve(JSObject().putCompat("ok", true))
    }

    private fun notifyAppLockBiometricFailed(targetPackage: String) {
        try {
            context.sendBroadcast(
                Intent(AppLockAccessibilityService.ACTION_BIOMETRIC_FAILED)
                    .setPackage(context.packageName)
                    .putExtra(AppLockAccessibilityService.EXTRA_TARGET_PACKAGE, targetPackage),
            )
        } catch (_: Exception) { }
    }

    private fun isConfiguredLockedPackage(targetPackage: String): Boolean {
        val raw = try { secureStore().get("duress-security-app") } catch (_: Exception) { null } ?: return false
        return try {
            val root = org.json.JSONObject(raw)
            val state = root.optJSONObject("state") ?: root
            val packages = state.optJSONArray("lockedPackages") ?: return false
            state.optBoolean("appLockEnabled", false) &&
                state.optBoolean("overlayEnabled", true) &&
                state.optBoolean("biometricEnabled", false) &&
                (0 until packages.length()).any { packages.optString(it) == targetPackage }
        } catch (_: Exception) {
            false
        }
    }

    @PluginMethod
    fun setSelfUninstallBlocked(call: PluginCall) { val blocked = call.getBoolean("blocked", false) ?: false; val ret = JSObject(); if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N || !dpm().isDeviceOwnerApp(context.packageName)) { call.resolve(ret.putCompat("ok", false)); return }; try { dpm().setUninstallBlocked(adminComponent(), context.packageName, blocked); ret.putCompat("ok", dpm().isUninstallBlocked(adminComponent(), context.packageName) == blocked) } catch (_: SecurityException) { ret.putCompat("ok", false) } catch (_: IllegalArgumentException) { ret.putCompat("ok", false) }; call.resolve(ret) }
    @PluginMethod
    fun setKioskMode(call: PluginCall) {
        val enabled = call.getBoolean("enabled", false) ?: false
        if (!dpm().isDeviceOwnerApp(context.packageName)) {
            call.resolve(JSObject().putCompat("ok", false)); return
        }
        val currentActivity = activity ?: run {
            call.resolve(JSObject().putCompat("ok", false)); return
        }
        try {
            if (enabled) {
                val requested = call.getArray("allowedPackages") ?: JSArray()
                val candidates = linkedSetOf<String>()
                for (index in 0 until requested.length()) {
                    val candidate = try { requested.getString(index).trim() } catch (_: Exception) { "" }
                    if (candidate.isBlank() || candidate == context.packageName) continue
                    if (!candidate.matches(Regex("^[A-Za-z0-9_]+(\\.[A-Za-z0-9_]+)+$"))) continue
                    // Only packages with a real launch activity may enter the OS-enforced allowlist.
                    val installed = try { context.packageManager.getLaunchIntentForPackage(candidate) != null } catch (_: Exception) { false }
                    if (installed) candidates.add(candidate)
                }
                val allowed = (candidates + context.packageName).toList()
                val stored = try {
                    secureStore().put(KIOSK_ALLOWED_PACKAGES_KEY, org.json.JSONArray(allowed).toString())
                } catch (_: Exception) { false }
                if (!stored) { call.resolve(JSObject().putCompat("ok", false)); return }
                dpm().setLockTaskPackages(adminComponent(), allowed.toTypedArray())
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    dpm().setLockTaskFeatures(adminComponent(), DevicePolicyManager.LOCK_TASK_FEATURE_HOME)
                }
                if (isKioskActive()) { call.resolve(JSObject().putCompat("ok", true)); return }
                currentActivity.runOnUiThread {
                    val success = try {
                        currentActivity.startLockTask()
                        true
                    } catch (_: Exception) {
                        try { dpm().setLockTaskPackages(adminComponent(), emptyArray()) } catch (_: Exception) { }
                        false
                    }
                    call.resolve(JSObject().putCompat("ok", success))
                }
            } else {
                currentActivity.runOnUiThread {
                    val success = try {
                        if (isKioskActive()) currentActivity.stopLockTask()
                        dpm().setLockTaskPackages(adminComponent(), emptyArray())
                        true
                    } catch (_: Exception) {
                        try { dpm().setLockTaskPackages(adminComponent(), emptyArray()); true } catch (_: Exception) { false }
                    }
                    call.resolve(JSObject().putCompat("ok", success))
                }
            }
        } catch (_: SecurityException) {
            call.resolve(JSObject().putCompat("ok", false))
        } catch (_: IllegalStateException) {
            call.resolve(JSObject().putCompat("ok", false))
        }
    }

    @PluginMethod
    fun launchKioskApp(call: PluginCall) {
        val target = call.getString("packageName")?.trim().orEmpty()
        if (target.isBlank() || target == context.packageName ||
            !dpm().isDeviceOwnerApp(context.packageName) || !isKioskActive()) {
            call.resolve(JSObject().putCompat("ok", false)); return
        }
        val allowed = try {
            val raw = secureStore().get(KIOSK_ALLOWED_PACKAGES_KEY) ?: "[]"
            val list = org.json.JSONArray(raw)
            (0 until list.length()).map { list.optString(it) }.toSet()
        } catch (_: Exception) { emptySet<String>() }
        if (target !in allowed) { call.resolve(JSObject().putCompat("ok", false)); return }
        val intent = try { context.packageManager.getLaunchIntentForPackage(target) } catch (_: Exception) { null }
        if (intent == null) { call.resolve(JSObject().putCompat("ok", false)); return }
        try {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            call.resolve(JSObject().putCompat("ok", true))
        } catch (_: Exception) {
            call.resolve(JSObject().putCompat("ok", false))
        }
    }

    private fun hasOverlayPermission(): Boolean = Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context)
    private fun hasUsageAccess(): Boolean { val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager; @Suppress("DEPRECATION") return appOps.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName) == AppOpsManager.MODE_ALLOWED }
    private fun isOurAccessibilityServiceEnabled(): Boolean { val services = Settings.Secure.getString(context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false; val expected = ComponentName(context, AppLockAccessibilityService::class.java).flattenToString(); return services.split(':').any { it.equals(expected, ignoreCase = true) } }
    private fun hasNotificationPermission(): Boolean = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    private fun isSelfUninstallBlocked(): Boolean { if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N || !dpm().isDeviceOwnerApp(context.packageName)) return false; return try { dpm().isUninstallBlocked(adminComponent(), context.packageName) } catch (_: Exception) { false } }
    private fun isKioskActive(): Boolean { val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager; return manager.lockTaskModeState == ActivityManager.LOCK_TASK_MODE_LOCKED }
}
private const val KIOSK_ALLOWED_PACKAGES_KEY = "duress-security-kiosk-allowed-packages"

private fun JSObject.putCompat(key: String, value: Any?): JSObject { put(key, value); return this }
