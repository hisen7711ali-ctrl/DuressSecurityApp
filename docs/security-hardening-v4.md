# Security hardening v4

This branch contains the reviewed startup/secure-storage hardening work derived from `DuressSecurityApp-v3-fixed.zip`.

Goals:
- keep the calculator decoy visible while Android Keystore initialization is slow;
- never trust in-memory default PINs when secure state was not successfully read;
- never replace an unreadable Keystore key with a new key while encrypted records exist;
- move Keystore I/O off the Android UI thread;
- bind the encrypted vault to a 32-byte device secret held by Android Keystore;
- use AES-256-GCM with authenticated envelope metadata and PBKDF2-SHA-256 at 600,000 iterations;
- migrate v1 vaults only after successful authentication and verify the replacement before commit;
- preserve the existing calculator trigger (`20272006=`) and PIN semantics.

Important review finding: the supplied v3 archive called `SecureStorage.warmUp()` as `initializeForApp()` from `MainActivity.kt`; that mismatch would break the Android compilation. The GitHub branch uses the corrected method name.

Validation policy: source/tests/typecheck/lint/APK must be verified by GitHub Actions before this branch is promoted to `main`. A passing CI build does not replace a physical Android install test.
