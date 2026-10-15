import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("startup retry keeps slow Keystore work off the UI path and is bounded", async () => {
  const bridge = await readFile("src/lib/native-bridge.ts", "utf8");
  const activity = await readFile("android-native/mainactivity-patch/MainActivity.kt", "utf8");
  const secure = await readFile("android-native/plugin/src/main/java/com/duresssecurity/admin/SecureStorage.kt", "utf8");
  const shell = await readFile("src/components/app-shell.tsx", "utf8");
  assert.match(bridge, /NATIVE_STORAGE_TIMEOUT_MS = 2500/);
  assert.match(activity, /DuressSecureWarmup/);
  assert.match(activity, /initializeForApp\(\)/);
  assert.match(secure, /DEVICE_SECRET_BYTES = 32/);
  assert.match(secure, /SecureRandom\(\)/);
  assert.match(secure, /SECURE_STORAGE_KEY_MISSING/);
  assert.match(shell, /STARTUP_RETRY_DELAY_MS = 3000/);
  assert.match(shell, /STARTUP_MAX_RETRIES = 12/);
  assert.match(shell, /STARTUP_HYDRATION_WATCHDOG_MS = 120000/);
  assert.match(shell, /if \(!ready\) return <FakeCalculator/);
  assert.doesNotMatch(shell, /Preparing the security gate|جارٍ تجهيز بوابة الحماية/);
});

test("vault v2 is device-bound on Android and authenticates its header", async () => {
  const crypto = await readFile("src/lib/vault-crypto.ts", "utf8");
  assert.match(crypto, /PBKDF2_ITERATIONS = 600_000/);
  assert.match(crypto, /VAULT_DEVICE_SECRET_KEY/);
  assert.match(crypto, /PBKDF2-SHA256\+DEVICE-SECRET/);
  assert.match(crypto, /additionalData/);
  assert.match(crypto, /LEGACY_VAULT_STORAGE_KEY/);
  assert.match(crypto, /verifyV2/);
  assert.match(crypto, /store\.setItem\(VAULT_STORAGE_KEY, upgradedRaw\)/);
});
