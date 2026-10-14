import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
const read = (path) => readFile(path, "utf8");

test("no Android factory reset path", async () => {
  const bridge = await read("src/lib/native-bridge.ts"); const service = await read("src/lib/security-service.ts");
  assert.doesNotMatch(bridge, /factoryReset|reboot\s*\(/i); assert.doesNotMatch(service, /DevicePolicyManager[^\n]*wipeData/i);
});

test("encrypted store uses AES-GCM and refuses silent key replacement", async () => {
  const storage = await read("android-native/plugin/src/main/java/com/duresssecurity/admin/SecureStorage.kt");
  assert.match(storage, /AES\/GCM\/NoPadding/); assert.match(storage, /AndroidKeyStore/); assert.match(storage, /SECURE_STORAGE_KEY_MISSING/); assert.match(storage, /hasExistingEncryptedRecords/);
});

test("accessibility service does not inspect text or keys", async () => {
  const service = await read("android-native/accessibility/src/main/java/com/duresssecurity/accessibility/AppLockAccessibilityService.kt");
  assert.doesNotMatch(service, /getText\(\)|textMatches|event\.text|KeyEvent/i);
});

test("Device Owner is required for kiosk policy", async () => {
  const plugin = await read("android-native/plugin/src/main/java/com/duresssecurity/admin/SecurityAdminPlugin.kt");
  assert.match(plugin, /isDeviceOwnerApp/); assert.match(plugin, /DevicePolicyManager/);
});

test("launcher discovery stays narrow", async () => {
  const setup = await read("scripts/android-setup.mjs"); const plugin = await read("android-native/plugin/src/main/java/com/duresssecurity/admin/SecurityAdminPlugin.kt");
  assert.doesNotMatch(setup + plugin, /QUERY_ALL_PACKAGES/); assert.match(setup, /android\.intent\.action\.MAIN/); assert.match(plugin, /Intent\.CATEGORY_LAUNCHER/);
});

test("storage failure is fail-closed and recovery is retry-only", async () => {
  const store = await read("src/lib/store.ts"); const shell = await read("src/components/app-shell.tsx"); const recovery = await read("src/components/storage-recovery-screen.tsx");
  assert.match(store, /session:\s*"storage-error"/); assert.match(shell, /session === "storage-error"/); assert.match(recovery, /secureStorageGet/); assert.doesNotMatch(recovery, /secureStorageClearOwned/); assert.match(recovery, /لم يتم حذف أي سجل تلقائيًا|No replacement key was created/);
});

test("screen capture protection is conditional", async () => {
  const activity = await read("android-native/mainactivity-patch/MainActivity.kt"); const plugin = await read("android-native/plugin/src/main/java/com/duresssecurity/admin/SecurityAdminPlugin.kt"); const bridge = await read("src/lib/native-bridge.ts"); const shell = await read("src/components/app-shell.tsx");
  assert.match(activity, /FLAG_SECURE/); assert.match(activity, /setScreenCaptureAllowed\(true\)/); assert.match(plugin, /fun setScreenCaptureAllowed\(call: PluginCall\)/); assert.match(bridge, /setScreenCaptureAllowed/); assert.match(shell, /nativeBridge\.setScreenCaptureAllowed\(!protectedUi\)/);
});
