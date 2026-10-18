package com.duresssecurity.admin

import android.content.Context
import android.util.Log

/**
 * Optional Shizuku-backed helper for elevated package-manager operations.
 * This path is deliberately capability-gated: if Shizuku is unavailable,
 * not bound, or permission is missing, the caller receives false and can
 * continue through the normal Device Owner / Settings fallback paths.
 */
object ElevatedShellHelper {
    private const val TAG = "DuressElevatedShell"

    private fun shizukuClass(): Class<*>? = runCatching {
        Class.forName("rikka.shizuku.Shizuku")
    }.getOrNull()

    fun pmClearViaShizuku(context: Context, packageName: String): Boolean {
        val target = packageName.trim()
        if (target.isEmpty()) return false

        val shizuku = shizukuClass() ?: return false
        return runCatching {
            val binder = shizuku.getMethod("getBinder").invoke(null)
            if (binder == null) return@runCatching false

            val permissionGranted = shizuku.getMethod("checkSelfPermission").invoke(null) as? Int
            if (permissionGranted != 0) return@runCatching false

            val newProcess = Class.forName("rikka.shizuku.Shizuku").getMethod(
                "newProcess",
                Array<String>::class.java,
                Array<String>::class.java,
                Array<String>::class.java
            )
            val process = newProcess.invoke(
                null,
                arrayOf("sh", "-c", "pm clear ${shellQuote(target)}"),
                null,
                null
            ) as? Process ?: return@runCatching false

            val exit = process.waitFor()
            exit == 0
        }.onFailure {
            Log.w(TAG, "Shizuku pm clear failed", it)
        }.getOrDefault(false)
    }

    private fun shellQuote(value: String): String =
        "'" + value.replace("'", "'\\''") + "'"
}
