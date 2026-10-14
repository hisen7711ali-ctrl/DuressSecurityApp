package com.duresssecurity.admin

import android.Manifest
import android.app.ActivityManager
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
    // Keystore operations may be slow on a cold emulator; never run them on the UI thread.
    private val secureStorageExecutor = Executors.newSingleThreadExecutor { task ->
        Thread(task, "DuressSecureStorage").apply { isDaemon = true }
    }
    private fun adminComponent(): ComponentName = ComponentName(context, AdminReceiver::class.java)
    private fun dpm(): DevicePolicyManager = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    private fun secureStore() = SecureStorage(context)

    @PluginMethod
    fun setScreenCaptureAllowed(call: PluginCall) {
        val allowed = call.getBoolean("allowed", false) ?: false
        val currentActivity = activity
        if (currentActivity == null) {
            call.resolve(JSObject().putCompat("ok", false))
            return
        }
        currentActivity.runOnUiThread {
            try {
                if (allowed) currentActivity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
                else currentActivity.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
                call.resolve(JSObject().putCompat("ok", true))
            } catch (_: Exception) {
                call.resolve(JSObject().putCompat("ok", false))
            }
        }
    }

    @PluginMethod
    fun isDeviceAdminActive(call: PluginCall) { call.resolve(JSObject().putCompat("active", dpm().isAdminActive(adminComponent()))) }

    @PluginMethod
    fun requestDeviceAdmin(call: PluginCall) {
        if (dpm().isAdminActive(adminComponent())) { call.resolve(JSObject().putCompat("granted", true)); return }
        saveCall(call)
        val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
            putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent())
            putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION, "Duress Security uses this permission only to lock the screen on request. It does not wipe the device or read the system PIN. You can revoke this permission in Android Settings.")
        }
        startActivityForResult(call, intent, "onDeviceAdminResult")
    }

    @ActivityCallback
    private fun onDeviceAdminResult(call: PluginCall?) { if (call != null) call.resolve(JSObject().putCompat("granted", dpm().isAdminActive(adminComponent()))) }

    @PluginMethod
    fun lockNow(call: PluginCall) {
        val ret = JSObject()
        if (!dpm().isAdminActive(adminComponent())) { call.resolve(ret.putCompat("ok", false)); return }
        try { dpm().lockNow(); ret.putCompat("ok", true) } catch (_: SecurityException) { ret.putCompat("ok", false) }
        call.resolve(ret)
    }

    @PluginMethod
    fun isBiometricAvailable(call: PluginCall) { call.resolve(JSObject().putCompat("available", biometricAvailable())) }
    private fun biometricAvailable(): Boolean = BiometricManager.from(context).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG) == BiometricManager.BIOMETRIC_SUCCESS

    @PluginMethod
    fun authenticateBiometric(call: PluginCall) {
        val fragmentActivity = activity as? androidx.fragment.app.FragmentActivity
        if (fragmentActivity == null) { call.resolve(JSObject().putCompat("success", false)); return }
        val reason = call.getString("reason") ?: "Unlock Duress Security"
        val executor = ContextCompat.getMainExecutor(context)
        val prompt = BiometricPrompt(fragmentActivity, executor, object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) { call.resolve(JSObject().putCompat("success", true)) }
            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) { call.resolve(JSObject().putCompat("success", false)) }
            override fun onAuthenticationFailed() {}
        })
        val info = BiometricPrompt.PromptInfo.Builder().setTitle(reason).setSubtitle("Biometric verification can only perform the one configured biometric action.").setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG).setNegativeButtonText("Cancel").build()
        fragmentActivity.runOnUiThread { prompt.authenticate(info) }
    }

    @PluginMethod
    fun listLaunchableApps(call: PluginCall) {
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val matches = try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) context.packageManager.queryIntentActivities(intent, PackageManager.ResolveInfoFlags.of(0L))
            else { @Suppress("DEPRECATION") context.packageManager.queryIntentActivities(intent, 0) }
        } catch (_: Exception) { call.resolve(JSObject().putCompat("apps", JSArray())); return }
        val rows = JSArray()
        matches.mapNotNull { info ->
            val packageName = info.activityInfo?.packageName ?: return@mapNotNull null
            if (packageName == context.packageName) return@mapNotNull null
            packageName to info.loadLabel(context.packageManager).toString()
        }.distinctBy { it.first }.sortedBy { it.second.lowercase() }.forEach { (packageName, label) -> rows.put(JSObject().putCompat("packageName", packageName).putCompat("label", label)) }
        call.resolve(JSObject().putCompat("apps", rows))
    }

    @PluginMethod
    fun getPermissionStatus(call: PluginCall) {
        val ret = JSObject()
        ret.putCompat("overlayPermission", hasOverlayPermission())
        ret.putCompat("usagePermission", hasUsageAccess())
        ret.putCompat("accessibilityPermission", isOurAccessibilityServiceEnabled())
        ret.putCompat("notificationPermission", hasNotificationPermission())
        ret.putCompat("autostartPermission", false)
        ret.putCompat("deviceAdmin", dpm().isAdminActive(adminComponent()))
        ret.putCompat("deviceOwner", dpm().isDeviceOwnerApp(context.packageName))
        ret.putCompat("biometricAvailable", biometricAvailable())
        ret.putCompat("preventUninstall", isSelfUninstallBlocked())
        ret.putCompat("dedicatedDeviceMode", isKioskActive())
        call.resolve(ret)
    }

    @PluginMethod
    fun requestSystemPermission(call: PluginCall) {
        val kind = call.getString("permission") ?: ""
        val result = JSObject()
        val intent = when (kind) {
            "overlayPermission" -> { if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) { call.resolve(result.putCompat("opened", false).putCompat("supported", false)); return }; Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}")) }
            "usagePermission" -> Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
            "accessibilityPermission" -> Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
            "notificationPermission" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName) else Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
            "autostartPermission" -> { call.resolve(result.putCompat("opened", false).putCompat("supported", false)); return }
            else -> { call.resolve(result.putCompat("opened", false).putCompat("supported", false)); return }
        }
        try { intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); context.startActivity(intent); result.putCompat("opened", true).putCompat("supported", true) } catch (_: Exception) { result.putCompat("opened", false).putCompat("supported", false) }
        call.resolve(result)
    }

    @PluginMethod
    fun secureGet(call: PluginCall) {
        val key = call.getString("key")
        if (key.isNullOrBlank()) {
            call.resolve(JSObject().putCompat("available", true).putCompat("found", false).putCompat("value", null))
            return
        }
        secureStorageExecutor.execute {
            try {
                val value = secureStore().get(key)
                call.resolve(JSObject().putCompat("available", true).putCompat("found", value != null).putCompat("value", value).putCompat("reason", null))
            } catch (error: Exception) {
                // Return only diagnostic categories; never expose stored values or PINs.
                val chain = generateSequence(error as Throwable?) { it.cause }.toList()
                val reason = when {
                    chain.any { it.message == "SECURE_STORAGE_KEY_MISSING" } -> "KEY_MISSING"
                    chain.any { it is javax.crypto.AEADBadTagException } -> "DECRYPTION_FAILED"
                    chain.any { it is java.security.KeyStoreException || it is java.security.UnrecoverableKeyException } -> "KEYSTORE_ERROR"
                    else -> "READ_FAILED"
                }
                call.resolve(JSObject().putCompat("available", false).putCompat("found", false).putCompat("value", null).putCompat("reason", reason))
            }
        }
    }

    @PluginMethod
    fun secureSet(call: PluginCall) {
        val key = call.getString("key")
        val value = call.getString("value")
        if (key.isNullOrBlank() || value == null) {
            call.resolve(JSObject().putCompat("ok", false))
            return
        }
        secureStorageExecutor.execute {
            val ok = try { secureStore().put(key, value) } catch (_: Exception) { false }
            call.resolve(JSObject().putCompat("ok", ok))
        }
    }

    @PluginMethod
    fun secureRemove(call: PluginCall) {
        val key = call.getString("key")
        if (key.isNullOrBlank()) {
            call.resolve(JSObject().putCompat("ok", false))
            return
        }
        secureStorageExecutor.execute {
            val ok = try { secureStore().remove(key) } catch (_: Exception) { false }
            call.resolve(JSObject().putCompat("ok", ok))
        }
    }

    @PluginMethod
    fun secureClearOwned(call: PluginCall) {
        secureStorageExecutor.execute {
            val ok = try { secureStore().removeOwned() } catch (_: Exception) { false }
            call.resolve(JSObject().putCompat("ok", ok))
        }
    }

    @PluginMethod
    fun setSelfUninstallBlocked(call: PluginCall) {
        val blocked = call.getBoolean("blocked", false) ?: false; val ret = JSObject()
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N || !dpm().isDeviceOwnerApp(context.packageName)) { call.resolve(ret.putCompat("ok", false)); return }
        try { dpm().setUninstallBlocked(adminComponent(), context.packageName, blocked); ret.putCompat("ok", dpm().isUninstallBlocked(adminComponent(), context.packageName) == blocked) }
        catch (_: SecurityException) { ret.putCompat("ok", false) } catch (_: IllegalArgumentException) { ret.putCompat("ok", false) }
        call.resolve(ret)
    }

    @PluginMethod
    fun setKioskMode(call: PluginCall) {
        val enabled = call.getBoolean("enabled", false) ?: false
        if (!dpm().isDeviceOwnerApp(context.packageName)) { call.resolve(JSObject().putCompat("ok", false)); return }
        val currentActivity = activity ?: run { call.resolve(JSObject().putCompat("ok", false)); return }
        try {
            if (enabled) {
                dpm().setLockTaskPackages(adminComponent(), arrayOf(context.packageName))
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) dpm().setLockTaskFeatures(adminComponent(), DevicePolicyManager.LOCK_TASK_FEATURE_HOME)
                currentActivity.runOnUiThread { val success = try { currentActivity.startLockTask(); true } catch (_: Exception) { try { dpm().setLockTaskPackages(adminComponent(), emptyArray()) } catch (_: Exception) {}; false }; call.resolve(JSObject().putCompat("ok", success)) }
            } else currentActivity.runOnUiThread { val success = try { currentActivity.stopLockTask(); dpm().setLockTaskPackages(adminComponent(), emptyArray()); true } catch (_: Exception) { try { dpm().setLockTaskPackages(adminComponent(), emptyArray()); true } catch (_: Exception) { false } }; call.resolve(JSObject().putCompat("ok", success)) }
        } catch (_: SecurityException) { call.resolve(JSObject().putCompat("ok", false)) } catch (_: IllegalStateException) { call.resolve(JSObject().putCompat("ok", false)) }
    }

    private fun hasOverlayPermission(): Boolean = Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context)
    private fun hasUsageAccess(): Boolean { val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager; @Suppress("DEPRECATION") return appOps.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName) == AppOpsManager.MODE_ALLOWED }
    private fun isOurAccessibilityServiceEnabled(): Boolean { val services = Settings.Secure.getString(context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false; val expected = ComponentName(context, AppLockAccessibilityService::class.java).flattenToString(); return services.split(':').any { it.equals(expected, ignoreCase = true) } }
    private fun hasNotificationPermission(): Boolean = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    private fun isSelfUninstallBlocked(): Boolean { if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N || !dpm().isDeviceOwnerApp(context.packageName)) return false; return try { dpm().isUninstallBlocked(adminComponent(), context.packageName) } catch (_: Exception) { false } }
    private fun isKioskActive(): Boolean { val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager; return manager.lockTaskModeState == ActivityManager.LOCK_TASK_MODE_LOCKED }
}

private fun JSObject.putCompat(key: String, value: Any?): JSObject { put(key, value); return this }
