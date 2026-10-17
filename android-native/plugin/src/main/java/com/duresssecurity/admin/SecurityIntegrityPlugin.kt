package com.duresssecurity.admin

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File
import java.security.MessageDigest

/** Defensive runtime integrity signals. These are signals, not proof of compromise. */
@CapacitorPlugin(name = "SecurityIntegrity")
class SecurityIntegrityPlugin : Plugin() {
    @PluginMethod
    fun getStatus(call: PluginCall) {
        val status = JSObject()
        status.put("rootSignals", rootSignals())
        status.put("hookSignals", hookSignals())
        status.put("signatureSha256", signatureSha256())
        status.put("packageName", context.packageName)
        status.put("installer", installerPackage())
        status.put("debuggable", (context.applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0)
        call.resolve(status)
    }

    private fun rootSignals(): List<String> = buildList {
        val suspiciousPackages = listOf(
            "com.topjohnwu.magisk",
            "me.weishu.kernelsu",
            "com.rifsxd.ksunext",
            "org.lsposed.manager",
            "de.robv.android.xposed.installer",
        )
        suspiciousPackages.forEach { pkg ->
            try { if (context.packageManager.getApplicationInfo(pkg, 0).enabled) add("package:$pkg") } catch (_: Exception) { }
        }
        listOf("/sbin/su", "/system/bin/su", "/system/xbin/su", "/product/bin/su", "/data/adb/magisk", "/data/adb/ksu").forEach {
            if (File(it).exists()) add("path:$it")
        }
        if (Build.TAGS?.contains("test-keys", ignoreCase = true) == true) add("build:test-keys")
    }

    private fun hookSignals(): List<String> = buildList {
        val suspiciousClasses = listOf(
            "de.robv.android.xposed.XposedBridge",
            "de.robv.android.xposed.XposedHelpers",
            "org.lsposed.lspd.impl.LSPosedBridge",
        )
        suspiciousClasses.forEach { name ->
            try { Class.forName(name, false, context.classLoader); add("class:$name") } catch (_: Throwable) { }
        }
        val suspiciousProcesses = listOf("frida-server", "frida-agent", "gum-js-loop")
        val maps = File("/proc/${android.os.Process.myPid()}/maps")
        if (maps.canRead()) {
            val text = try { maps.readText() } catch (_: Exception) { "" }
            suspiciousProcesses.forEach { marker -> if (text.contains(marker, ignoreCase = true)) add("maps:$marker") }
        }
    }

    private fun signatureSha256(): String? {
        return try {
            val info = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                context.packageManager.getPackageInfo(context.packageName, PackageManager.GET_SIGNING_CERTIFICATES)
            } else {
                @Suppress("DEPRECATION") context.packageManager.getPackageInfo(context.packageName, PackageManager.GET_SIGNATURES)
            }
            val bytes = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                info.signingInfo?.apkContentsSigners?.firstOrNull()?.toByteArray()
            } else {
                @Suppress("DEPRECATION") info.signatures?.firstOrNull()?.toByteArray()
            } ?: return null
            MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
        } catch (_: Exception) { null }
    }

    private fun installerPackage(): String? = try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            context.packageManager.getInstallSourceInfo(context.packageName).installingPackageName
        } else {
            @Suppress("DEPRECATION") context.packageManager.getInstallerPackageName(context.packageName)
        }
    } catch (_: Exception) { null }
}
