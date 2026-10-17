package com.duresssecurity.admin

import android.content.Context
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONArray

/** Stores only minimal non-secret lock policy in Device Protected Storage for Direct Boot. */
@CapacitorPlugin(name = "DirectBootPolicy")
class DirectBootPolicyPlugin : Plugin() {
    private fun prefs() = context.createDeviceProtectedStorageContext()
        .getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    @PluginMethod
    fun setPolicy(call: PluginCall) {
        val enabled = call.getBoolean("appLockEnabled", false) ?: false
        val packages = call.getArray("lockedPackages") ?: JSArray()
        val safe = JSONArray()
        for (i in 0 until packages.length()) {
            val pkg = try { packages.getString(i).trim() } catch (_: Exception) { "" }
            if (pkg.matches(Regex("^[A-Za-z0-9_]+(\\.[A-Za-z0-9_]+)+$"))) safe.put(pkg)
        }
        val ok = prefs().edit()
            .putBoolean(KEY_ENABLED, enabled)
            .putString(KEY_PACKAGES, safe.toString())
            .commit()
        call.resolve(JSObject().put("ok", ok))
    }

    @PluginMethod
    fun getPolicy(call: PluginCall) {
        call.resolve(JSObject()
            .put("appLockEnabled", prefs().getBoolean(KEY_ENABLED, false))
            .put("lockedPackages", JSONArray(prefs().getString(KEY_PACKAGES, "[]") ?: "[]").toString()))
    }

    companion object {
        const val PREFS = "duress_direct_boot_policy"
        const val KEY_ENABLED = "app_lock_enabled"
        const val KEY_PACKAGES = "locked_packages"
    }
}
