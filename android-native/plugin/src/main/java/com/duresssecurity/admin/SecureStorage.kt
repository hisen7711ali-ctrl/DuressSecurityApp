package com.duresssecurity.admin

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** AES-GCM encrypted app-owned storage backed by an Android Keystore key. */
internal class SecureStorage(context: Context) {
    private val preferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun initializeForApp(): Boolean = synchronized(STORAGE_LOCK) {
        getOrCreateKey()
        getOrCreateDeviceSecret()
        true
    }

    fun get(key: String): String? = synchronized(STORAGE_LOCK) {
        validateKey(key)
        val encoded = preferences.getString(key, null) ?: return@synchronized null
        decrypt(encoded)
    }

    fun put(key: String, value: String): Boolean = synchronized(STORAGE_LOCK) {
        validateKey(key)
        val encrypted = encrypt(value)
        if (!preferences.edit().putString(key, encrypted).commit()) throw IllegalStateException("SECURE_STORAGE_WRITE_FAILED")
        true
    }

    fun remove(key: String): Boolean = synchronized(STORAGE_LOCK) { validateKey(key); preferences.edit().remove(key).commit() }

    fun removeOwned(): Boolean = synchronized(STORAGE_LOCK) {
        if (!preferences.edit().clear().commit()) return@synchronized false
        try { KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }.deleteEntry(KEY_ALIAS); true } catch (_: Exception) { false }
    }

    private fun getOrCreateDeviceSecret(): String {
        val existing = preferences.getString(DEVICE_SECRET_KEY, null)
        if (existing != null) {
            val plain = try { decrypt(existing) } catch (_: Exception) { throw IllegalStateException("SECURE_STORAGE_DEVICE_SECRET_INVALID") }
            val decoded = try { Base64.decode(plain, Base64.NO_WRAP) } catch (_: Exception) { null }
            if (decoded?.size == DEVICE_SECRET_BYTES) return plain
            throw IllegalStateException("SECURE_STORAGE_DEVICE_SECRET_INVALID")
        }
        val bytes = ByteArray(DEVICE_SECRET_BYTES)
        SecureRandom().nextBytes(bytes)
        val plain = Base64.encodeToString(bytes, Base64.NO_WRAP)
        if (!preferences.edit().putString(DEVICE_SECRET_KEY, encrypt(plain)).commit()) throw IllegalStateException("SECURE_STORAGE_WRITE_FAILED")
        return plain
    }

    private fun validateKey(key: String) {
        require(key.startsWith("duress-security") || key.startsWith("duress-")) { "Only Duress Security namespaced keys are allowed" }
        require(key.length <= 200) { "Storage key is too long" }
    }

    private fun encrypt(plaintext: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        return Base64.encodeToString(cipher.iv + cipher.doFinal(plaintext.toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)
    }

    private fun decrypt(encoded: String): String {
        val combined = Base64.decode(encoded, Base64.NO_WRAP)
        require(combined.size > GCM_IV_LENGTH_BYTES) { "Invalid encrypted value" }
        val iv = combined.copyOfRange(0, GCM_IV_LENGTH_BYTES)
        val ciphertext = combined.copyOfRange(GCM_IV_LENGTH_BYTES, combined.size)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        val key = getExistingKey() ?: throw IllegalStateException("SECURE_STORAGE_KEY_MISSING")
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv))
        return String(cipher.doFinal(ciphertext), Charsets.UTF_8)
    }

    private fun getExistingKey(): SecretKey? = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }.getKey(KEY_ALIAS, null) as? SecretKey

    private fun getOrCreateKey(): SecretKey {
        getExistingKey()?.let { return it }
        if (hasExistingEncryptedRecords()) throw IllegalStateException("SECURE_STORAGE_KEY_MISSING")
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        generator.init(KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true).build())
        return generator.generateKey()
    }

    private fun hasExistingEncryptedRecords(): Boolean = preferences.all.keys.isNotEmpty()

    companion object {
        private val STORAGE_LOCK = Any()
        private const val PREFS_NAME = "duress_security_encrypted_store"
        private const val KEY_ALIAS = "duress_security_aes_gcm_key_v1"
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val GCM_IV_LENGTH_BYTES = 12
        private const val GCM_TAG_LENGTH_BITS = 128
        private const val DEVICE_SECRET_KEY = "duress-security-vault-device-secret"
        private const val DEVICE_SECRET_BYTES = 32
    }
}
