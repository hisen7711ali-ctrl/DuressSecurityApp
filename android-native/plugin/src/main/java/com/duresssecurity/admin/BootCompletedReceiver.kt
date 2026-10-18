package com.duresssecurity.admin

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.admin.DevicePolicyManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.UserManager
import androidx.core.app.NotificationCompat
import org.json.JSONObject

/** Restores the two protection layers after boot without requiring Device Owner. */
class BootCompletedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        when (intent?.action) {
            Intent.ACTION_LOCKED_BOOT_COMPLETED -> handleLockedBoot(context)
            Intent.ACTION_BOOT_COMPLETED -> handleUnlockedBoot(context)
        }
    }

    private fun handleLockedBoot(context: Context) {
        // Only boot-safe state is consulted here; the accessibility service restores app gates separately.
        applyBootLock(context)
    }

    private fun handleUnlockedBoot(context: Context) {
        val userManager = context.getSystemService(Context.USER_SERVICE) as UserManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && !userManager.isUserUnlocked) return

        applyBootLock(context)
        notifyExtendedLockIfNeeded(context)
    }

    /** Device Admin is deliberately the only authority used for lockNow(). */
    private fun applyBootLock(context: Context) {
        val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val admin = ComponentName(context, AdminReceiver::class.java)
        if (!dpm.isAdminActive(admin)) return

        val shouldLock = readShouldLockOnBoot(context)
        if (!shouldLock) return

        try {
            dpm.lockNow()
        } catch (_: SecurityException) {
            // Device Admin may have been revoked.
        } catch (_: Exception) {
        }
    }

    private fun readShouldLockOnBoot(context: Context): Boolean {
        // Prefer full app state; fall back to direct-boot policy snapshot.
        try {
            val raw = SecureStorage(context).get("duress-security-app")
            if (!raw.isNullOrBlank()) {
                val root = JSONObject(raw)
                val state = root.optJSONObject("state") ?: root
                val home = state.optBoolean("homeLockEnabled", true)
                val appLock = state.optBoolean("appLockEnabled", true)
                if (home || appLock) return true
            }
        } catch (_: Exception) {
        }
        try {
            val policyRaw = SecureStorage(context).get("duress-security-direct-boot-policy")
            if (!policyRaw.isNullOrBlank()) {
                val policy = JSONObject(policyRaw)
                if (policy.optBoolean("appLockEnabled", false)) return true
                if (policy.optBoolean("homeLockEnabled", false)) return true
            }
        } catch (_: Exception) {
        }
        // Default: if admin is active and we cannot read prefs, still lock for safety when flag file says so.
        return try {
            SecureStorage(context).get("duress-security-lock-on-boot") == "1"
        } catch (_: Exception) {
            false
        }
    }

    private fun notifyExtendedLockIfNeeded(context: Context) {
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
