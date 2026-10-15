# Security Hardening V4

## Implemented

- Android Keystore AES-GCM storage is initialized in a detached background thread during `MainActivity.onCreate`.
- Native secure-storage calls run on a dedicated background executor and the executor is shut down with the plugin lifecycle.
- Secure-storage bridge calls are bounded to 2.5 seconds.
- Startup retries are owned by the app shell rather than nested inside the storage primitive.
- A failed native secure read now throws instead of being converted into a missing record. This prevents a storage outage from silently becoming the default security state.
- Recovery remains fail-closed and does not offer an automatic destructive secure-store reset.
- Vault V2 uses AES-256-GCM, PBKDF2-SHA-256 with 600,000 iterations, a random salt and IV, authenticated header data, and a 256-bit device-bound secret held by Android Keystore.
- V1 vault records are migrated only after successful decryption and verification of the new V2 record.
- Android runtime is offline by design; CI verifies that the final APK does not declare INTERNET, ACCESS_NETWORK_STATE, or QUERY_ALL_PACKAGES.

## Threat model / remaining limitations

1. **Compromised/rooted device:** Android Keystore is intended to protect key material, but a fully compromised device or privileged attacker can defeat application-level guarantees. This app does not claim root/jailbreak resistance.
2. **Device data reset:** The device-bound vault secret is intentionally lost when the app's secure storage/Keystore state is destroyed. A copied vault file alone is therefore insufficient to decrypt V2 data.
3. **In-memory session:** While the vault is unlocked, the active WebCrypto key exists in application memory. Locking the session clears the active key reference; JavaScript memory cannot be guaranteed to be instantly zeroized by the runtime.
4. **User PIN strength:** The master PIN is intentionally `0000` for the requested decoy flow. The application uses lockout escalation, but this PIN should be changed before real-world deployment if the product threat model permits it.
5. **Physical Android testing:** CI can compile and inspect the APK, but only a real device can validate OEM-specific Keystore latency, accessibility behavior, overlay behavior, boot behavior, and the requested manual `20272006=` → `0000` flow.

## Security invariant

If secure storage cannot be read, the application must not infer that the record is absent and must not overwrite it with defaults. It remains locked/recovery-only until secure storage becomes readable or the user performs an explicit, non-destructive recovery action.
