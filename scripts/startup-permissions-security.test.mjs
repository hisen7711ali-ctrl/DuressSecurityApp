import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (p) => readFile(path.join(root, p), "utf8");

test("startup keeps calculator visible while secure storage retries are serialized and bounded", async () => {
  const shell = await read("src/components/app-shell.tsx");
  assert.match(shell, /STARTUP_RETRY_DELAY_MS = 3000/);
  assert.match(shell, /STARTUP_MAX_RETRIES = 12/);
  assert.match(shell, /await hydrateSession\(\)/);
  assert.match(shell, /await sleep\(STARTUP_RETRY_DELAY_MS\)/);
  assert.match(shell, /if \(!ready\) return <FakeCalculator/);
  assert.doesNotMatch(shell, /330000/);
});

test("first Android launch has a dedicated permission onboarding screen", async () => {
  const shell = await read("src/components/app-shell.tsx");
  const onboarding = await read("src/components/permissions-onboarding-screen.tsx");
  assert.match(shell, /PermissionsOnboardingScreen/);
  assert.match(shell, /hasCompletedInitialPermissions/);
  assert.match(onboarding, /overlayPermission/);
  assert.match(onboarding, /usagePermission/);
  assert.match(onboarding, /accessibilityPermission/);
  assert.match(onboarding, /notificationPermission/);
  assert.match(onboarding, /requestDeviceAdminNative/);
});

test("native secure storage is warmed before JavaScript startup work", async () => {
  const activity = await read("android-native/mainactivity-patch/MainActivity.kt");
  const storage = await read("android-native/plugin/src/main/java/com/duresssecurity/admin/SecureStorage.kt");
  assert.match(activity, /DuressSecureWarmup/);
  assert.match(activity, /initializeForApp\(\)/);
  assert.match(storage, /getOrCreateDeviceSecret/);
  assert.match(storage, /DEVICE_SECRET_BYTES = 32/);
});

test("secure storage plugin does not keep a background executor alive after teardown", async () => {
  const plugin = await read("android-native/plugin/src/main/java/com/duresssecurity/admin/SecurityAdminPlugin.kt");
  assert.match(plugin, /override fun handleOnDestroy\(\)/);
  assert.match(plugin, /secureStorageExecutor\.shutdownNow\(\)/);
});
