package com.duresssecurity.vault

import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * SecureVaultPlugin — Keystore-backed key/value store for the app's own
 * persisted state (PINs, the local vault entries, settings).
 *
 * Every value is written through EncryptedSharedPreferences: both the pref
 * keys and the values are encrypted (AES256-SIV for keys, AES256-GCM for
 * values). The encryption key itself is generated and held inside the
 * Android Keystore via MasterKey — hardware-backed on devices with a
 * StrongBox/TEE — and is never exposed to this plugin, to JavaScript, or
 * written to disk in the clear.
 *
 * Honest scope: this protects data AT REST against someone reading the
 * app's files directly (e.g. off a rooted device, an adb backup, or a lost
 * phone before it's ever unlocked). It is not a substitute for the PIN gate
 * itself — once the app is unlocked by its own logic, the data is decrypted
 * for normal use like any other app's data. There is no network code here
 * and nothing in this file ever leaves the device.
 */
@CapacitorPlugin(name = "SecureVault")
class SecureVaultPlugin : Plugin() {
    private val PREFS_NAME = "duress_secure_vault"

    private fun prefs() = EncryptedSharedPreferences.create(
        context,
        PREFS_NAME,
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    @PluginMethod
    fun getItem(call: PluginCall) {
        val key = call.getString("key")
        if (key.isNullOrEmpty()) {
            call.reject("missing key")
            return
        }
        val result = JSObject()
        try {
            result.put("value", prefs().getString(key, null))
        } catch (e: Exception) {
            result.put("value", null)
        }
        call.resolve(result)
    }

    @PluginMethod
    fun setItem(call: PluginCall) {
        val key = call.getString("key")
        val value = call.getString("value")
        if (key.isNullOrEmpty() || value == null) {
            call.reject("missing key/value")
            return
        }
        val result = JSObject()
        try {
            prefs().edit().putString(key, value).apply()
            result.put("ok", true)
        } catch (e: Exception) {
            result.put("ok", false)
        }
        call.resolve(result)
    }

    @PluginMethod
    fun removeItem(call: PluginCall) {
        val key = call.getString("key")
        if (key.isNullOrEmpty()) {
            call.reject("missing key")
            return
        }
        val result = JSObject()
        try {
            prefs().edit().remove(key).apply()
            result.put("ok", true)
        } catch (e: Exception) {
            result.put("ok", false)
        }
        call.resolve(result)
    }
}
