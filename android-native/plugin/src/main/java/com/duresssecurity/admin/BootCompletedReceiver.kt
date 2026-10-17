package com.duresssecurity.admin

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.UserManager
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import org.json.JSONObject

/**
 * Handles both Direct Boot and normal post-unlock boot.
 * Only minimal App Lock policy is read from Device Protected Storage before unlock;
 * private encrypted application state remains in credential-encrypted storage.
 */
class BootCompletedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_LOCKED_BOOT_COMPLETED -> handleLockedBoot(context)
            Intent.ACTION_BOOT_COMPLETED -> handleUnlockedBoot(context)
        }
    }

    private fun handleLockedBoot(context: Context) {
        val direct = context.createDeviceProtectedStorageContext()
        val prefs = direct.getSharedPreferences(DirectBootPolicyPlugin.PREFS, Context.MODE_PRIVATE)
        val enabled = prefs.getBoolean(DirectBootPolicyPlugin.KEY_ENABLED, false)
        val raw = prefs.getString(DirectBootPolicyPlugin.KEY_PACKAGES, "[]") ?: "[]"
        val packages = try { JSONArray(raw).length() } catch (_: Exception) { 0 }
        if (!enabled || packages == 0) return
        // Do not try to launch the WebView before unlock. The accessibility service
        // is marked directBootAware; its enforcement layer can consume this minimal
        // device-protected policy without exposing vault/PIN material.
    }

    private fun handleUnlockedBoot(context: Context) {
        val userManager = context.getSystemService(Context.USER_SERVICE) as UserManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && !userManager.isUserUnlocked) return
        val raw = try { SecureStorage(context).get("duress-security-state") } catch (_: Exception) { null } ?: return
        val until = try { JSONObject(raw).optLong("extendedLockUntil", 0L) } catch (_: Exception) { 0L }
        if (until <= System.currentTimeMillis()) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Duress Security protection", NotificationManager.IMPORTANCE_DEFAULT).apply {
                    description = "Reminds you that the app's extended lock is still active after reboot."
                },
            )
        }
        val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        val pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT or
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
        val pending = PendingIntent.getActivity(context, 22, launchIntent, pendingFlags)
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(context.applicationInfo.icon)
            .setContentTitle("Duress Security")
            .setContentText("Your extended in-app lock is still active. Open the app to view its status.")
            .setContentIntent(pending)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()
        try { manager.notify(NOTIFICATION_ID, notification) } catch (_: SecurityException) { }
    }

    companion object {
        private const val CHANNEL_ID = "duress-security-boot-lock"
        private const val NOTIFICATION_ID = 73055
    }
}
