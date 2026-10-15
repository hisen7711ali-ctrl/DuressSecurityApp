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
});

test("secure reads fail closed instead of becoming a missing/default record", async () => {
  const storage = await read("src/lib/app-storage.ts");
  const store = await read("src/lib/store.ts");
  assert.match(storage, /throw new Error\(reason\)/);
  assert.match(storage, /Never turn a failed secure read into a missing record/);
  assert.match(store, /if \(!raw\) return \{ \.\.INITIAL_SECURITY_STATE \}/);
  assert.match(store, /nativeBridge\.isNativeAndroid\(\) \? null/);
});

test("storage failures are fail-closed and recovery cannot erase data", async () => {
  const store = await read("src/lib/store.ts");
  const shell = await read("src/components/app-shell.tsx");
  const recovery = await read("src/components/storage-recovery-screen.tsx");
  assert.match(store, /session:\s*"storage-error"/);
  assert.match(shell, /session === "storage-error"/);
  assert.match(recovery, /Retry secure storage/);
  assert.doesNotMatch(recovery, /secureStorageClearOwned/);
  assert.match(recovery, /لم يتم حذف أي سجل تلقائيًا/);
});

test("startup hydration is bounded, retried serially, and native Keystore access stays off the UI thread", async () => {
  const store = await read("src/lib/store.ts");
  const shell = await read("src/components/app-shell.tsx");
  const plugin = await read("android-native/plugin/src/main/java/com/duresssecurity/admin/SecurityAdminPlugin.kt");
  const bridge = await read("src/lib/native-bridge.ts");
  assert.doesNotMatch(store, /Promise\.all\(\[nativeBridge\.secureStorageGet/);
  assert.match(shell, /STARTUP_RETRY_DELAY_MS = 3000/);
  assert.match(shell, /STARTUP_MAX_RETRIES = 12/);
  assert.match(shell, /await hydrateSession\(\)/);
  assert.match(shell, /await sleep\(STARTUP_RETRY_DELAY_MS\)/);
  assert.match(shell, /STARTUP_HYDRATION_WATCHDOG_MS = 120000/);
  assert.match(bridge, /NATIVE_STORAGE_TIMEOUT_MS = 2500/);
  assert.match(plugin, /private val secureStorageExecutor = Executors\.newSingleThreadExecutor/);
  assert.match(plugin, /secureStorageExecutor\.execute/);
  assert.match(plugin, /secureStorageExecutor\.shutdownNow\(\)/);
});
