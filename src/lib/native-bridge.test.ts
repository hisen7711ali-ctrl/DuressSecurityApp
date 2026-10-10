import test from "node:test";
import assert from "node:assert/strict";
import {
  isNativeAndroid,
  isDeviceAdminActive,
  requestDeviceAdmin,
  nativeLockNow,
  isBiometricAvailable,
  authenticateBiometric,
  getPermissionStatus,
  requestSystemPermission,
  secureStorageGet,
  secureStorageSet,
  secureStorageRemove,
  secureStorageClearOwned,
  setSelfUninstallBlocked,
  setKioskMode,
  listLaunchableApps,
} from "./native-bridge.ts";

// This suite runs under plain `node --test` (no DOM, no `window`), exactly the
// environment the browser/web build falls back to when it is NOT wrapped by
// Capacitor. Every native-bridge call must degrade to a safe, non-throwing
// "unavailable" result instead of crashing the web app.

test("isNativeAndroid() is false without window/Capacitor", () => {
  assert.equal(isNativeAndroid(), false);
});

test("isDeviceAdminActive() resolves false, never throws", async () => {
  assert.equal(await isDeviceAdminActive(), false);
});

test("requestDeviceAdmin() resolves false, never throws", async () => {
  assert.equal(await requestDeviceAdmin(), false);
});

test("nativeLockNow() resolves false, never throws", async () => {
  assert.equal(await nativeLockNow(), false);
});


test("isBiometricAvailable() resolves false, never throws", async () => {
  assert.equal(await isBiometricAvailable(), false);
});

test("authenticateBiometric() resolves false, never throws", async () => {
  assert.equal(await authenticateBiometric("test"), false);
});


test("permission status is unavailable outside Android", async () => {
  assert.equal(await getPermissionStatus(), null);
  assert.equal(await requestSystemPermission("overlayPermission"), false);
});

test("Keystore storage methods fail closed outside Android", async () => {
  assert.deepEqual(await secureStorageGet("duress-security-app"), { available: false, found: false, value: null });
  assert.equal(await secureStorageSet("duress-security-app", "{}"), false);
  assert.equal(await secureStorageRemove("duress-security-app"), false);
  assert.equal(await secureStorageClearOwned(), false);
});

test("Device Owner policies and installed-app discovery are unavailable on web", async () => {
  assert.equal(await setSelfUninstallBlocked(true), false);
  assert.equal(await setKioskMode(true), false);
  assert.equal(await listLaunchableApps(), null);
});
