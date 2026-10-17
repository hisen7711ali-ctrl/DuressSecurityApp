import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => readFile(path.join(root, file), "utf8");

test("protected-app gate is target-aware and routes 5555 to target-only maintenance", async () => {
  const service = await read("android-native/plugin/src/main/java/com/duresssecurity/admin/AppLockAccessibilityService.kt");
  assert.match(service, /getApplicationLabel\(packageManager\.getApplicationInfo\(targetPackage/);
  assert.match(service, /getApplicationIcon\(targetPackage\)/);
  assert.match(service, /App under maintenance/);
  assert.match(service, /التطبيق قيد الصيانة/);
  assert.match(service, /TARGET_MAINTENANCE_KEY/);
  assert.match(service, /maintenancePinControls/);
  assert.match(service, /startMaintenanceTicker/);
  assert.ok(service.includes("title.setOnClickListener"));
  const verify = service.slice(service.indexOf("private fun verifyPin"), service.indexOf("private fun recordFailedAttempt"));
  assert.ok(verify.includes("maintenanceUntil == null && policy.extendedLockPin?.let"));
  assert.ok(verify.includes("writeTargetMaintenance(targetPackage, until)"));
  assert.ok(verify.includes("showGate(targetPackage, maintenanceUntil = until)"));
  assert.ok(verify.includes("dispatchOwnerPinAction(targetPackage, typed)"), "4444 routes to the app calculator/owner flow");
  assert.match(service, /30-day maintenance/);
});

test("protected-app gate routes maintenance per target, routes duress to the owner flow and never wipes another app", async () => {
  const service = await read("android-native/plugin/src/main/java/com/duresssecurity/admin/AppLockAccessibilityService.kt");
  assert.match(service, /policy\.extendedLockPin/);
  assert.match(service, /policy\.duressPin/);
  assert.match(service, /policy\.wipePin/);
  assert.doesNotMatch(service, /typed\s*==\s*"5555"|typed\s*==\s*"4444"|typed\s*==\s*"7777"/);
  assert.match(service, /dispatchOwnerPinAction\(targetPackage, typed\)/);
  const verify = service.slice(service.indexOf("private fun verifyPin"), service.indexOf("private fun recordFailedAttempt"));
  assert.doesNotMatch(verify, /policy\.wipePin\?\.let/);
  assert.match(verify, /wantsTargetMaintenance/);
  assert.match(verify, /did not delete any files|لم تُحذف ملفات/);
});

test("legacy per-app maintenance records remain readable and recoverable", async () => {
  const service = await read("android-native/plugin/src/main/java/com/duresssecurity/admin/AppLockAccessibilityService.kt");
  assert.match(service, /duress-security-app-lock-maintenance/);
  assert.match(service, /SecureStorage\(this\)\.get\(TARGET_MAINTENANCE_KEY\)/);
  assert.match(service, /SecureStorage\(this\)\.put\(TARGET_MAINTENANCE_KEY/);
});

test("app-lock gate uses the same faith-quote source values as the home hints", async () => {
  const quotes = await read("src/lib/quotes.ts");
  const service = await read("android-native/plugin/src/main/java/com/duresssecurity/admin/AppLockAccessibilityService.kt");
  const expected = [
    "﴿وَأَعِدُّوا لَهُم مَّا اسْتَطَعْتُم مِّن قُوَّةٍ وَمِن رِّبَاطِ الْخَيْلِ تُرْهِبُونَ بِهِ عَدُوَّ اللَّهِ وَعَدُوَّكُمْ﴾",
    "قال ﷺ: «رِبَاطُ يَوْمٍ وَلَيْلَةٍ خَيْرٌ مِنْ صِيَامِ شَهْرٍ وَقِيَامِهِ»",
    "﴿وَمِنْ آيَاتِهِ أَنْ خَلَقَ لَكُم مِّنْ أَنفُسِكُمْ أَزْوَاجًا لِّتَسْكُنُوا إِلَيْهَا وَجَعَلَ بَيْنَكُم مَّوَدَّةً وَرَحْمَةً﴾",
    "قال ﷺ: «يَا مَعْشَرَ الشَّبَابِ مَنِ اسْتَطَاعَ مِنْكُمُ الْبَاءَةَ فَلْيَتَزَوَّجْ، فَإِنَّهُ أَغَضُّ لِلْبَصَرِ وَأَحْصَنُ لِلْفَرْجِ»",
  ];
  for (const quote of expected) {
    assert.ok(quotes.includes(quote), `home quote missing: ${quote}`);
    assert.ok(service.includes(quote), `app-lock quote missing: ${quote}`);
  }
  assert.match(service, /5000L/);
});

test("7777 wipe verifies the Android secure store was actually cleared before defaults are recreated", async () => {
  const wipe = await read("src/components/wipe-screen.tsx");
  assert.match(wipe, /secureStorageClearOwned\(\)/);
  assert.match(wipe, /verifyOwnedSecureStoreEmpty/);
  assert.match(wipe, /duress-security-app-lock-maintenance/);
  assert.match(wipe, /duress-security-vault-device-secret/);
  assert.match(wipe, /await wipeAppData\(\)/);
  assert.match(wipe, /wipeLocal\(\)/);
  assert.doesNotMatch(wipe, /confirm\(|window\.confirm\(/);
});

test("PIN changes remain centralized in the encrypted policy and old literals are not accepted by the native gate", async () => {
  const store = await read("src/lib/store.ts");
  const service = await read("android-native/plugin/src/main/java/com/duresssecurity/admin/AppLockAccessibilityService.kt");
  assert.match(store, /action\.type === "save-pin"/);
  assert.match(store, /normalizePin\(action\.value\)/);
  assert.match(service, /SecureStorage\(this\)\.get\("duress-security-app"\)/);
  assert.doesNotMatch(service, /"5555"|"4444"|"7777"/);
});
