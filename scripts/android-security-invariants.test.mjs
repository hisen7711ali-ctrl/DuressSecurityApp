import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => readFile(path.join(root, p), 'utf8');

test('native emergency reset does not expose Android factory reset', async () => {
  const plugin = await read('android-native/plugin/src/main/java/com/duresssecurity/admin/SecurityAdminPlugin.kt');
  const adminPolicies = await read('android-native/plugin/src/main/res/xml/device_admin.xml');
  assert.doesNotMatch(plugin, /\.wipeData\s*\(/);
  assert.doesNotMatch(adminPolicies, /wipe-data/);
  assert.match(plugin, /fun secureClearOwned\(/);
});

test('encrypted store uses AES-GCM with a key held by Android Keystore', async () => {
  const storage = await read('android-native/plugin/src/main/java/com/duresssecurity/admin/SecureStorage.kt');
  assert.match(storage, /AES\/GCM\/NoPadding/);
  assert.match(storage, /AndroidKeyStore/);
  assert.match(storage, /KeyGenParameterSpec/);
  assert.match(storage, /deleteEntry\(KEY_ALIAS\)/);
});

test('app-lock accessibility service cannot read window contents or filter keys', async () => {
  const serviceXml = await read('android-native/plugin/src/main/res/xml/app_lock_accessibility_service.xml');
  const service = await read('android-native/plugin/src/main/java/com/duresssecurity/admin/AppLockAccessibilityService.kt');
  assert.match(serviceXml, /canRetrieveWindowContent="false"/);
  assert.match(serviceXml, /canRequestFilterKeyEvents="false"/);
  assert.match(service, /TYPE_WINDOW_STATE_CHANGED/);
  assert.match(service, /event\.packageName/);
  assert.doesNotMatch(service, /rootInActiveWindow|AccessibilityNodeInfo/);
});

test('Device Owner is required for kiosk and uninstall policies', async () => {
  const plugin = await read('android-native/plugin/src/main/java/com/duresssecurity/admin/SecurityAdminPlugin.kt');
  assert.match(plugin, /fun setKioskMode\([\s\S]*?isDeviceOwnerApp\(context\.packageName\)/);
  assert.match(plugin, /fun setSelfUninstallBlocked\([\s\S]*?isDeviceOwnerApp\(context\.packageName\)/);
});

test('launcher discovery has a narrow package-visibility query and avoids QUERY_ALL_PACKAGES', async () => {
  const setup = await read('scripts/android-setup.mjs');
  const plugin = await read('android-native/plugin/src/main/java/com/duresssecurity/admin/SecurityAdminPlugin.kt');
  assert.match(setup, /duress_security_strings\.xml/);
  assert.doesNotMatch(setup, /duress-security-strings\.xml/);
  assert.match(setup, /android\.intent\.category\.LAUNCHER/);
  assert.match(plugin, /Intent\.CATEGORY_LAUNCHER/);
  assert.doesNotMatch(setup + plugin, /uses-permission[^\n]*QUERY_ALL_PACKAGES/);
});

test('native storage failure routes the app to explicit fail-closed recovery UI', async () => {
  const store = await read('src/lib/store.ts');
  const shell = await read('src/components/app-shell.tsx');
  const recovery = await read('src/components/storage-recovery-screen.tsx');
  assert.match(store, /session:\s*"storage-error"/);
  assert.match(shell, /session === "storage-error"/);
  assert.match(recovery, /secureStorageClearOwned/);
  assert.match(recovery, /This does not factory-reset the phone|لن يتم مسح الهاتف/);
});

test('native activity marks screenshots secure and does not claim to replace Keyguard', async () => {
  const activity = await read('android-native/mainactivity-patch/MainActivity.kt');
  assert.match(activity, /FLAG_SECURE/);
  assert.match(activity, /do not read, replace, or dismiss a secure Android Keyguard/i);
});
