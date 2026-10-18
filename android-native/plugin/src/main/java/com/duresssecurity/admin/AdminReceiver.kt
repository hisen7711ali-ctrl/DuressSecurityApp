package com.duresssecurity.admin

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent
import android.widget.Toast

/**
 * Device Admin receiver — used for lockNow() without Device Owner.
 * Soft uninstall protection relies on keeping admin active (user must disable admin before uninstall).
 */
class AdminReceiver : DeviceAdminReceiver() {
    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
        Toast.makeText(context, "تم تفعيل مسؤول الجهاز — قفل الشاشة ومنع الإزالة الناعم جاهزان", Toast.LENGTH_LONG).show()
    }

    override fun onDisabled(context: Context, intent: Intent) {
        super.onDisabled(context, intent)
        Toast.makeText(context, "تم إلغاء مسؤول الجهاز — قفل الشاشة السريع وطبقة منع الإزالة الناعمة توقفت", Toast.LENGTH_LONG).show()
    }

    override fun onDisableRequested(context: Context, intent: Intent): CharSequence {
        val soft = try { SecureStorage(context).get("duress-security-prevent-uninstall") == "1" } catch (_: Exception) { false }
        return if (soft) {
            "إلغاء مسؤول الجهاز يعطّل قفل الشاشة السريع ويسهّل إزالة تطبيق Duress Security. هل تريد المتابعة؟"
        } else {
            "إلغاء مسؤول الجهاز يعطّل قفل شاشة الهاتف من التطبيق."
        }
    }
}
