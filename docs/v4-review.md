# v4 review

The supplied `DuressSecurityApp-v3-fixed.zip` was reviewed against the current `main` tree. The current repository already contains the stronger device-bound vault design (600,000 PBKDF2 iterations, Android Keystore device secret, authenticated AAD, and verified migration). The supplied archive also contains an Android compile mismatch: `MainActivity.kt` calls `SecureStorage.initializeForApp()`, while that archive's `SecureStorage.kt` exposes `warmUp()`. Therefore the archive is not copied wholesale.

This branch is used to run the complete Android CI suite against the current hardened tree before any promotion to `main`.
