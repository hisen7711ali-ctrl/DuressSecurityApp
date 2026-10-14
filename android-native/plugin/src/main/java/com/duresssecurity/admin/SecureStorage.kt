package com.duresssecurity.admin

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Small AES-GCM encrypted store for app-owned security state. The AES key is
 * generated and retained by Android Keystore; it is never exported to JavaScript.
 * Values are encrypted before SharedPreferences sees them.
 */
internal class SecureStorage(context: Context) {
    private val preferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    @Synchronized
    fun get(key: String): String? {
        validateKey(key)
        val encoded = preferences.getString(key, null) ?: return null
        // Propagate corruption/Keystore invalidation to the Capacitor plugin, which
        // reports `available=false`. Do not misclassify damaged ciphertext as an empty
        // record and accidentally migrate plaintext legacy data over it.
        return decrypt(encoded)
    }

    @Synchronized
    fun put(key: String, value: String): Boolean {
        validateKey(key)
        return try {
            preferences.edit().putString(key, encrypt(value)).commit()
        } catch (_: Exception) {
            false
        }
    }

    @Synchronized
    fun remove(key: String): Boolean {
        validateKey(key)
        return preferences.edit().remove(key).commit()
    }

    @Synchronized
    fun removeOwned(): Boolean {
        // This preferences file is dedicated to Duress Security's encrypted data.
        // Clear its records, then rotate the local Keystore key (cryptographic erasure).
        if (!preferences.edit().clear().commit()) return false
        return try {
            val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
            keyStore.deleteEntry(KEY_ALIAS)
            true
        } catch (_: Exception) {
            false
        }
    }

    private fun validateKey(key: String) {
        require(key.startsWith("duress-security") || key.startsWith("duress-")) {
            "Only Duress Security namespaced keys are allowed"
        }
        require(key.length <= 200) { "Storage key is too long" }
    }

    private fun encrypt(plaintext: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        val ciphertext = cipher.doFinal(plaintext.toByteArray(Charsets.UTF_8))
        val combined = cipher.iv + ciphertext
        return Base64.encodeToString(combined, Base64.NO_WRAP)
    }

    private fun decrypt(encoded: String): String {
        val combined = Base64.decode(encoded, Base64.NO_WRAP)
        require(combined.size > GCM_IV_LENGTH_BYTES) { "Invalid encrypted value" }
        val iv = combined.copyOfRange(0, GCM_IV_LENGTH_BYTES)
        val ciphertext = combined.copyOfRange(GCM_IV_LENGTH_BYTES, combined.size)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        // Never create a replacement key while reading existing ciphertext. A new
        // key cannot decrypt old data and would hide a real Keystore recovery issue.
        val key = getExistingKey()
            ?: throw IllegalStateException("SECURE_STORAGE_KEY_MISSING")
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv))
        return String(cipher.doFinal(ciphertext), Charsets.UTF_8)
    }

    private fun getExistingKey(): SecretKey? {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        return keyStore.getKey(KEY_ALIAS, null) as? SecretKey
    }

    private fun getOrCreateKey(): SecretKey {
        getExistingKey()?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build(),
        )
        return generator.generateKey()
    }

    companion object {
        private const val PREFS_NAME = "duress_security_encrypted_store"
        private const val KEY_ALIAS = "duress_security_aes_gcm_key_v1"
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val GCM_IV_LENGTH_BYTES = 12
        private const val GCM_TAG_LENGTH_BITS = 128
    }
}
