package com.duresssecurity.admin

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent
import android.widget.Toast

/** Device Admin receiver used by the security lock implementation. */
class AdminReceiver : DeviceAdminReceiver() {
    private fun show(context: Context, message: String) {
        Toast.makeText(context, message, Toast.LENGTH_LONG).show()
    }

    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
        runCatching {
            show(context, "تم تفعيل صلاحية مسؤول الجهاز لتطبيق DuressSecurityApp")
        }
    }

    override fun onDisabled(context: Context, intent: Intent) {
        super.onDisabled(context, intent)
        runCatching {
            show(context, "تم إلغاء صلاحية مسؤول الجهاز")
        }
    }
}
