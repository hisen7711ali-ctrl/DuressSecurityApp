import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
const read = (p) => readFile(p, "utf8");

test("encrypted storage cannot replace a missing key", async () => {
  const b = await read("src/lib/native-bridge.ts");
  const k = await read("android-native/plugin/src/main/java/com/duresssecurity/admin/SecureStorage.kt");
  assert.doesNotMatch(b, /factoryReset|reboot\s*\(/i);
  assert.match(k, /AES\/GCM\/NoPadding/);
  assert.match(k, /AndroidKeyStore/);
  assert.match(k, /SECURE_STORAGE_KEY_MISSING/);
  assert.match(k, /hasExistingEncryptedRecords/);
  assert.match(k, /setIsStrongBoxBacked\(true\)/);
  assert.match(k, /StrongBoxUnavailableException/);
});

test("secure reads fail closed instead of becoming a missing/default record", async () => {
  const storage = await read("src/lib/app-storage.ts");
  const store = await read("src/lib/store.ts");
  assert.match(storage, /throw new Error\(lastReason\)/);
  assert.match(storage, /Never turn a failed secure read into a missing record/);
  assert.match(storage, /STARTUP_MAX_ATTEMPTS = 12/);
  assert.match(storage, /STARTUP_SECURE_STORAGE_RETRY_EXHAUSTED/);
  assert.match(storage, /initializeSecureStorage\(\)/);
  assert.match(store, /if \(!raw\) return \{\s*\.\.\.INITIAL_SECURITY_STATE\s*\}/);
  assert.match(store, /nativeBridge\.isNativeAndroid\(\) \? null/);
});

test("storage recovery never resets on normal startup", async () => {
  const recovery = await read("src/components/storage-recovery-screen.tsx");
  assert.match(recovery, /Retry secure storage/);
  assert.match(recovery, /Advanced recovery/);
  assert.match(recovery, /secureStorageClearOwned/);
  assert.match(recovery, /window\.confirm/);
  assert.match(recovery, /if \(!confirmed\) return/);
  assert.match(recovery, /لم يتم حذف أي سجل تلقائيًا/);
});

test("startup hydration is bounded, retried serially, and native Keystore access stays off the UI thread", async () => {
  const store = await read("src/lib/store.ts");
  const shell = await read("src/components/app-shell.tsx");
  const storage = await read("src/lib/app-storage.ts");
  const plugin = await read("android-native/plugin/src/main/java/com/duresssecurity/admin/SecurityAdminPlugin.kt");
  const bridge = await read("src/lib/native-bridge.ts");
  assert.doesNotMatch(store, /Promise\.all\(\[nativeBridge\.secureStorageGet/);
  assert.match(storage, /STARTUP_RETRY_DELAY_MS = 3000/);
  assert.match(storage, /STARTUP_MAX_ATTEMPTS = 12/);
  assert.match(shell, /STARTUP_RETRY_DELAY_MS = 3000/);
  assert.match(shell, /STARTUP_MAX_RETRIES = 2/);
  assert.match(shell, /await hydrateSession\(\)/);
  assert.match(shell, /await sleep\(STARTUP_RETRY_DELAY_MS\)/);
  assert.match(shell, /STARTUP_HYDRATION_WATCHDOG_MS = 80000/);
  assert.match(shell, /if \(!ready\) return <FakeCalculator/);
  assert.match(bridge, /NATIVE_STORAGE_TIMEOUT_MS = 5000/);
  assert.match(bridge, /NATIVE_INITIALIZE_TIMEOUT_MS = 10000/);
  assert.match(bridge, /initializeSecureStorage\(\)/);
  assert.match(plugin, /private val secureStorageExecutor = Executors\.newSingleThreadExecutor/);
  assert.match(plugin, /initializeSecureStorage/);
  assert.match(plugin, /secureStorageExecutor\.execute/);
  assert.match(plugin, /secureStorageExecutor\.shutdownNow\(\)/);
});

test("Android native extras include the optional Shizuku path", async () => {
  const copy = await read("scripts/copy-native-security-extras.mjs");
  const additions = await read("android-native/app-build-gradle-additions.txt");
  assert.match(copy, /ElevatedShellHelper\.kt/);
  assert.match(copy, /TargetAppDataWiper\.kt/);
  assert.match(copy, /dev\.rikka\.shizuku:api:13\.1\.5/);
  assert.match(copy, /dev\.rikka\.shizuku:provider:13\.1\.5/);
  assert.match(additions, /dev\.rikka\.shizuku:api:13\.1\.5/);
});

test("Android backup and transfer rules are generated and asserted in the final manifest", async () => {
  const setup = await read("scripts/android-setup.mjs");
  assert.match(setup, /backup_rules\.xml/);
  assert.match(setup, /data_extraction_rules\.xml/);
  assert.match(setup, /set\("allowBackup", "false"\)/);
  assert.match(setup, /set\("fullBackupContent", "@xml\/backup_rules"\)/);
  assert.match(setup, /set\("dataExtractionRules", "@xml\/data_extraction_rules"\)/);
  assert.match(setup, /android:allowBackup/);
  assert.match(setup, /android:fullBackupContent/);
  assert.match(setup, /android:dataExtractionRules/);
});
