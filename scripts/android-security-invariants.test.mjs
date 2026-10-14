import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
const read = (p) => readFile(p, "utf8");

test("encrypted storage cannot replace a missing key", async () => {
  const b = await read("src/lib/native-bridge.ts"); const k = await read("android-native/plugin/src/main/java/com/duresssecurity/admin/SecureStorage.kt");
  assert.doesNotMatch(b, /factoryReset|reboot\s*\(/i); assert.match(k, /AES\/GCM\/NoPadding/); assert.match(k, /AndroidKeyStore/); assert.match(k, /SECURE_STORAGE_KEY_MISSING/); assert.match(k, /hasExistingEncryptedRecords/);
});

test("storage failures are fail-closed and recovery cannot erase data", async () => {
  const store = await read("src/lib/store.ts"); const shell = await read("src/components/app-shell.tsx"); const recovery = await read("src/components/storage-recovery-screen.tsx");
  assert.match(store, /session:\s*\"storage-error\"/); assert.match(shell, /session === \"storage-error\"/); assert.match(recovery, /Retry secure storage/); assert.doesNotMatch(recovery, /secureStorageClearOwned/); assert.match(recovery, /لم يتم حذف أي سجل تلقائيًا/);
});
