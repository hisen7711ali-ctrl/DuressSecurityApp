package com.duresssecurity.admin

import android.content.Context
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.PluginMethod
import org.json.JSONArray
import org.json.JSONObject

/** Stores only minimal non-secret lock policy in Device Protected Storage for Direct Boot. */
@CapacitorPlugin(name = "DirectBootPolicy")
class DirectBootPolicyPlugin : Plugin() {
    private fun prefs() = context.createDeviceProtectedStorageContext()
        .getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    override fun load() {
        super.load()
        try {
            val raw = SecureStorage(context).get("duress-security-app") ?: return
            val root = JSONObject(raw)
            val state = root.optJSONObject("state") ?: root
            val enabled = state.optBoolean("appLockEnabled", false)
            val packages = state.optJSONArray("lockedPackages") ?: JSONArray()
            val safe = JSONArray()
            for (i in 0 until packages.length()) {
                val pkg = packages.optString(i).trim()
                if (pkg.matches(Regex("^[A-Za-z0-9_]+(\\.[A-Za-z0-9_]+)+$"))) safe.put(pkg)
            }
            prefs().edit().putBoolean(KEY_ENABLED, enabled).putString(KEY_PACKAGES, safe.toString()).apply()
        } catch (_: Exception) {
            // During Direct Boot the credential-encrypted store can be unavailable;
            // keep the last device-protected policy instead of treating it as empty.
        }
    }

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
