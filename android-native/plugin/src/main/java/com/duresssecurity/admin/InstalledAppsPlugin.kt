package com.duresssecurity.admin

import android.content.pm.ApplicationInfo
import android.graphics.Bitmap
import android.graphics.Canvas
import android.util.Base64
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.ByteArrayOutputStream

@CapacitorPlugin(name = "InstalledApps")
class InstalledAppsPlugin : Plugin() {
    @PluginMethod
    fun listInstalledApps(call: PluginCall) {
        val pm = context.packageManager
        val apps = try { pm.getInstalledApplications(0) } catch (_: Exception) {
            call.resolve(JSObject().putCompat("apps", JSArray())); return
        }
        val rows = JSArray()
        apps.asSequence()
            .filter { it.packageName != context.packageName }
            .filter { (it.flags and ApplicationInfo.FLAG_INSTALLED) != 0 }
            .map { info ->
                val label = runCatching { pm.getApplicationLabel(info).toString() }
                    .getOrDefault(info.packageName).ifBlank { info.packageName }
                Triple(info.packageName, label, loadIconDataUrl(info))
            }
            .sortedBy { it.second.lowercase() }
            .forEach { (packageName, label, iconDataUrl) ->
                rows.put(JSObject().putCompat("packageName", packageName).putCompat("label", label).putCompat("iconDataUrl", iconDataUrl))
            }
        call.resolve(JSObject().putCompat("apps", rows))
    }

    private fun loadIconDataUrl(info: ApplicationInfo): String? = try {
        val drawable = info.loadIcon(context.packageManager)
        val width = drawable.intrinsicWidth.takeIf { it > 0 } ?: 96
        val height = drawable.intrinsicHeight.takeIf { it > 0 } ?: 96
        val size = maxOf(width, height).coerceIn(48, 192)
        val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        drawable.setBounds(0, 0, size, size)
        drawable.draw(canvas)
        val output = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.PNG, 100, output)
        bitmap.recycle()
        "data:image/png;base64," + Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP)
    } catch (_: Exception) { null }
}

private fun JSObject.putCompat(key: String, value: Any?): JSObject { put(key, value); return this }
