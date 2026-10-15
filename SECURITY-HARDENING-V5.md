# Security Hardening V5

## What was hardened

- Android secure storage remains backed by Android Keystore AES-GCM; encrypted records never fall back to plaintext when the Keystore cannot be read.
- Startup secure-storage reads are retried serially with a 3-second delay and a hard 12-attempt bound. Transient Keystore/plugin failures are retried; key-missing, corruption, and device-secret-invalid states fail closed.
- MainActivity warms the Keystore/device-bound secret on a daemon background thread before JavaScript needs it. SecureStorage plugin calls run on a dedicated background executor, never on the UI thread.
- The calculator remains the first visible surface while secure storage is warming. Protected UI is not opened from a failed/default security record.
- A failed secure read is never interpreted as "record missing", so the default `0000` state cannot overwrite a previously stored security record after a storage failure.
- Recovery is non-destructive: the recovery screen retries secure storage and does not automatically clear the Keystore or encrypted data.
- Vault encryption is device-bound on Android: PBKDF2-SHA-256 at 600,000 iterations is combined with a random 32-byte Keystore-protected device secret, then reduced to an AES-256-GCM key. The authenticated header binds the vault version, KDF parameters, and salt.
- Legacy vault records are migrated only after successful decryption and verification of the new record. Clearing Android app data intentionally invalidates the device-bound vault secret; this is fail-closed rather than silently falling back to password-only decryption.
- Android backup/transfer configuration and offline manifest invariants remain enforced by the generated Android project checks.

## Important threat-model limits

- A rooted/compromised Android device or a process with access to the live unlocked application can potentially access plaintext while the vault is open. WebCrypto `CryptoKey` material is intentionally kept only in process memory during an unlocked session.
- Password/PIN secrecy still matters. A four-digit PIN is not a suitable vault passphrase; the vault requires a longer passphrase.
- Android app-data clearing or loss of the Keystore key is intentionally unrecoverable for a device-bound vault unless a separate backup/export mechanism is added.

## Verification status

This branch is source-hardened and must still pass the repository's GitHub Actions test/typecheck/APK pipeline before being treated as a verified Android build. No physical-device test is claimed by this document.
