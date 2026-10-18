package com.duresssecurity.admin

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.os.Build

/** Safe cross-app data reset helper using only the official DevicePolicyManager API. */
object TargetAppDataWiper {
    fun isSupported(context: Context, targetPackage: String): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return false
        if (targetPackage.isBlank() || targetPackage == context.packageName) return false
        val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        return dpm.isDeviceOwnerApp(context.packageName)
    }

    fun clear(
        context: Context,
        targetPackage: String,
        adminReceiver: Class<*>,
        executor: java.util.concurrent.Executor,
        listener: DevicePolicyManager.OnClearApplicationUserDataListener,
    ): Boolean {
        if (!isSupported(context, targetPackage)) return false
        val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val admin = ComponentName(context, adminReceiver)
        return try {
            dpm.clearApplicationUserData(admin, targetPackage, executor, listener)
            true
        } catch (_: SecurityException) {
            false
        } catch (_: IllegalArgumentException) {
            false
        }
    }
}
