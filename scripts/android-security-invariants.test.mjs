import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => readFile(path.join(root, p), 'utf8');

test('native storage failure routes the app to explicit fail-closed recovery UI', async () => {
  const store = await read('src/lib/store.ts');
  const shell = await read('src/components/app-shell.tsx');
  const recovery = await read('src/components/storage-recovery-screen.tsx');
  assert.match(store, /session:\s*"storage-error"/);
  assert.match(shell, /session === "storage-error"/);
  assert.match(recovery, /secureStorageClearOwned/);
  assert.match(recovery, /This does not factory-reset the phone|لن يتم مسح الهاتف/);
});

test('native activity uses conditional screen capture protection and keeps the app PIN separate from Android Keyguard', async () => {
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
  assert.match(shell, /protectedUi = !calculatorFront && ready && session !== "duress"/);
});

test('native startup calls are bounded so a broken Android bridge cannot leave initialization spinning forever', async () => {
  const bridge = await read('src/lib/native-bridge.ts');
  assert.match(bridge, /NATIVE_CALL_TIMEOUT_MS\s*=\s*2500/);
  assert.match(bridge, /withNativeTimeout\(plugin\.getPermissionStatus\(\)/);
  assert.match(bridge, /withNativeTimeout\(plugin\.secureGet/);
  assert.match(bridge, /withNativeTimeout\(plugin\.secureSet/);
});
