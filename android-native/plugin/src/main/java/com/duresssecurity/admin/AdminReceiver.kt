package com.duresssecurity.admin

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent
import android.widget.Toast

/**
 * Required by Android for any app that wants Device Admin rights
 * (DevicePolicyManager.lockNow). Deliberately does nothing beyond
 * telling the user plainly what happened — it does NOT try to resist being
 * disabled: the user can always remove this app's admin rights from
 * Settings → Security → Device admin apps, same as any other legitimate app.
 */
class AdminReceiver : DeviceAdminReceiver() {
    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
        Toast.makeText(context, "تم تفعيل صلاحية مسؤول الجهاز لتطبيق DuressSecurityApp", Toast.LENGTH_LONG).show()
    }

    override fun onDisabled(context: Context, intent: Intent) {
        super.onDisabled(context, intent)
        Toast.makeText(context, "تم إلغاء صلاحية مسؤول الجهاز", Toast.LENGTH_LONG).show()
    }
}
