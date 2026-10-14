import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");

// Keep these invariants intentionally source-level: the Android setup script is
// responsible for materializing the native files into the generated android/ tree.

test('native emergency reset does not expose Android factory reset', async () => {
  const bridge = await read('src/lib/native-bridge.ts');
  const service = await read('src/lib/security-service.ts');
  assert.doesNotMatch(bridge, /factoryReset|reboot\s*\(/i);
  assert.doesNotMatch(service, /DevicePolicyManager[^\n]*wipeData/i);
});

test('encrypted store uses AES-GCM with a key held by Android Keystore', async () => {
  const storage = await read('android-native/plugin/src/main/java/com/duresssecurity/admin/SecureStorage.kt');
  assert.match(storage, /AES\/GCM\/NoPadding/);
  assert.match(storage, /AndroidKeyStore/);
  assert.match(storage, /SECURE_STORAGE_KEY_MISSING/);
  assert.match(storage, /hasExistingEncryptedRecords/);
});

test('app-lock accessibility service cannot read window contents or filter keys', async () => {
  const service = await read('android-native/accessibility/src/main/java/com/duresssecurity/accessibility/AppLockAccessibilityService.kt');
  assert.doesNotMatch(service, /getText\(\)|textMatches|event\.text|KeyEvent/i);
});

test('Device Owner is required for kiosk and uninstall policies', async () => {
  const plugin = await read('android-native/plugin/src/main/java/com/duresssecurity/admin/SecurityAdminPlugin.kt');
  assert.match(plugin, /isDeviceOwnerApp/);
  assert.match(plugin, /DevicePolicyManager/);
});

test('launcher discovery has a narrow package-visibility query and avoids QUERY_ALL_PACKAGES', async () => {
  const setup = await read('scripts/android-setup.mjs');
  const plugin = await read('android-native/plugin/src/main/java/com/duresssecurity/admin/SecurityAdminPlugin.kt');
  assert.doesNotMatch(setup + plugin, /QUERY_ALL_PACKAGES/);
  assert.match(setup, /android\.intent\.action\.MAIN/);
  assert.match(plugin, /Intent\.CATEGORY_LAUNCHER/);
});

test('native storage failure routes the app to explicit fail-closed recovery UI', async () => {
  const store = await read('src/lib/store.ts');
  const shell = await read('src/components/app-shell.tsx');
  const recovery = await read('src/components/storage-recovery-screen.tsx');
  assert.match(store, /session:\s*"storage-error"/);
  assert.match(shell, /session === "storage-error"/);
  assert.match(recovery, /secureStorageGet/);
  assert.doesNotMatch(recovery, /secureStorageClearOwned/);
  assert.match(recovery, /لم يتم حذف أي سجل تلقائيًا|No replacement key was created/);
});

test('native activity uses conditional screen capture protection and keeps the app PIN gate separate from Android Keyguard', async () => {
  const activity = await read('android-native/mainactivity-patch/MainActivity.kt');
  const plugin = await read('android-native/plugin/src/main/java/com/duresssecurity/admin/SecurityAdminPlugin.kt');
  const bridge = await read('src/lib/native-bridge.ts');
  const shell = await read('src/components/app-shell.tsx');
  assert.match(activity, /FLAG_SECURE/);
  assert.match(activity, /setScreenCaptureAllowed\(true\)/);
  assert.match(activity, /fun setScreenCaptureAllowed\(allowed: Boolean\)/);
  assert.match(activity, /clearFlags\(WindowManager\.LayoutParams\.FLAG_SECURE\)/);
  assert.match(activity, /addFlags\(WindowManager\.LayoutParams\.FLAG_SECURE\)/);
  assert.match(plugin, /fun setScreenCaptureAllowed\(call: PluginCall\)/);
  assert.match(plugin, /FLAG_SECURE/);
  assert.match(bridge, /setScreenCaptureAllowed/);
  assert.match(shell, /const protectedUi = !calculatorFront && ready && session !== "duress"/);
  assert.match(shell, /nativeBridge\.setScreenCaptureAllowed\(!protectedUi\)/);
});
