package com.duresssecurity.admin

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import org.json.JSONObject

/**
 * After the user unlocks Android following reboot, checks the encrypted app lock record
 * and posts a visible notification if the in-app 30-day gate is still active. It does
 * not start an Activity from the background (new Android releases restrict that).
 */
class BootCompletedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
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
