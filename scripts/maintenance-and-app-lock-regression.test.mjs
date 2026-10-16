import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => readFile(path.join(root, file), "utf8");

test("extended lock uses maintenance copy and hides normal recovery UI", async () => {
  const source = await read("src/components/extended-lock-screen.tsx");
  assert.match(source, /التطبيق قيد الصيانة/);
  assert.match(source, /30 يوماً/);
  assert.match(source, /left-\[15%\] top-\[3\.5rem\]/);
  assert.doesNotMatch(source, /ShieldCheck/);
  assert.match(source, /onClick=\{openRecovery\}/);
  assert.match(source, /اضغط لإلغاء وضع الصيانة/);
  assert.match(source, /ضع كلمة السر لإلغاء وضع الصيانة/);
  assert.match(source, /next.length === 4/);
});

test("device-level controls are not blocked by a test-device UI check", async () => {
  const source = await read("src/components/settings-screen.tsx");
  assert.match(source, /action: \{ type: "toggle-prevent", value \}/);
  assert.match(source, /action: \{ type: "toggle-kiosk", value \}/);
  assert.doesNotMatch(source, /if \(!deviceOwner\) \{\s*setToast\(t\.deviceOwnerOnly/);
});

test("native app-lock gate uses an on-screen keypad instead of the system keyboard", async () => {
  const source = await read("android-native/plugin/src/main/java/com/duresssecurity/admin/AppLockAccessibilityService.kt");
  assert.match(source, /listOf\("أ", "ي", "ع"\)/);
  assert.match(source, /listOf\("1", "2", "3"\)/);
  assert.match(source, /listOf\("back", "0", "ok"\)/);
  assert.match(source, /pinValue.length == 4/);
  assert.match(source, /attempts >= 5/);
  assert.doesNotMatch(source, /EditText|InputMethodManager/);
  assert.match(source, /duressPin/);
  assert.match(source, /extendedLockPin/);
  assert.match(source, /wipePin/);
  assert.match(source, /dispatchOwnerPinAction\(targetPackage, typed\)/);
  assert.match(source, /performHapticFeedback/);
});

test("native app-lock gate does not dismiss on its own overlay package event", async () => {
  const source = await read("android-native/plugin/src/main/java/com/duresssecurity/admin/AppLockAccessibilityService.kt");
  assert.match(source, /if \(lockView == null\) \{\s*currentTarget = null/);
  assert.match(source, /override fun onInterrupt\(\) \{[\s\S]*Do not remove/);
});

test("device-policy failures do not claim that this is a test-device-only feature", async () => {
  const source = await read("src/lib/store.ts");
  assert.match(source, /لم يُفعّل منع الإزالة/);
  assert.match(source, /مالك الجهاز \(Device Owner\)/);
  assert.match(source, /أندرويد لم يسمح بتفعيل وضع الجهاز المخصص/);
  assert.doesNotMatch(source, /تتطلب هذه الميزة إعداد الجهاز كـ Device Owner/);
  assert.doesNotMatch(source, /جهاز اختبار مُهيّأ كـ Device Owner/);
  const settings = await read("src/components/settings-screen.tsx");
  assert.match(settings, /صلاحية مسؤول الجهاز العادية وحدها لا تكفي/);
});


test("Android system lock prerequisites are exposed and the real Keyguard remains in charge", async () => {
  const plugin = await read("android-native/plugin/src/main/java/com/duresssecurity/admin/SecurityAdminPlugin.kt");
  const bridge = await read("src/lib/native-bridge.ts");
  const store = await read("src/lib/store.ts");
  const settings = await read("src/components/settings-screen.tsx");
  const activity = await read("android-native/mainactivity-patch/MainActivity.kt");
  assert.match(plugin, /KeyguardManager/);
  assert.match(plugin, /deviceSecure/);
  assert.match(bridge, /deviceSecure: boolean/);
  assert.match(store, /!nativeStatus\.deviceSecure/);
  assert.match(settings, /اختبار قفل شاشة الهاتف الآن/);
  assert.doesNotMatch(activity, /setShowWhenLocked\(true\)|setTurnScreenOn\(true\)|FLAG_SHOW_WHEN_LOCKED|FLAG_TURN_SCREEN_ON/);
});

test("native special PINs are handed to the same primary submitPin flow", async () => {
  const service = await read("android-native/plugin/src/main/java/com/duresssecurity/admin/AppLockAccessibilityService.kt");
  const activity = await read("android-native/mainactivity-patch/MainActivity.kt");
  const shell = await read("src/components/app-shell.tsx");
  assert.match(service, /EXTRA_OWNER_PIN_ACTION/);
  assert.match(activity, /__duressSecurityPendingPinAction/);
  assert.match(shell, /state\.submitPin\(pin\)/);
  assert.match(shell, /__duressSecurityHandlePinAction/);
});

test("Windows build scripts avoid shell-splitting the Node executable and Vite shim", async () => {
  const env = await read("scripts/with-app-env.mjs");
  const setup = await read("scripts/android-setup.mjs");
  const apk = await read("scripts/build-apk.mjs");
  assert.match(env, /node_modules", "vite", "bin", "vite\.js"/);
  assert.match(setup, /shell: process\.platform === "win32" && cmd !== process\.execPath/);
  assert.match(apk, /shell: process\.platform === "win32" && cmd !== process\.execPath/);
});


test("maintenance recovery is rate-limited and preserves separate device policies", async () => {
  const store = await read("src/lib/store.ts");
  const start = store.indexOf("recoverExtendedLock: async");
  const end = store.indexOf("openOverlay: (overlay)", start);
  const recovery = store.slice(start, end);
  const screen = await read("src/components/extended-lock-screen.tsx");
  assert.match(recovery, /nextLockoutDelayMs/);
  assert.match(recovery, /state\.maxAttempts/);
  assert.doesNotMatch(recovery, /setKioskMode\(false\)|setSelfUninstallBlocked\(false\)/);
  assert.match(screen, /recoveryBlockedSeconds/);
  assert.match(screen, /disabled=\{recoveryBlockedSeconds > 0\}/);
});

test("native App Lock biometric flow requires configured package and enabled biometric setting", async () => {
  const service = await read("android-native/plugin/src/main/java/com/duresssecurity/admin/AppLockAccessibilityService.kt");
  const plugin = await read("android-native/plugin/src/main/java/com/duresssecurity/admin/SecurityAdminPlugin.kt");
  const bridge = await read("src/lib/native-bridge.ts");
  const shell = await read("src/components/app-shell.tsx");
  assert.match(service, /BiometricManager/);
  assert.match(service, /dispatchBiometricRequest\(targetPackage\)/);
  assert.match(service, /ACTION_BIOMETRIC_UNLOCKED/);
  assert.match(plugin, /state\.optBoolean\("biometricEnabled", false\)/);
  assert.match(plugin, /isConfiguredLockedPackage\(targetPackage\)/);
  assert.match(plugin, /BiometricPrompt\.PromptInfo\.Builder\(\)/);
  assert.match(plugin, /onAuthenticationSucceeded/);
  assert.match(plugin, /ACTION_BIOMETRIC_FAILED/);
  assert.match(bridge, /completeAppLockBiometric/);
  assert.match(bridge, /cancelAppLockBiometric/);
  assert.match(shell, /nativeBridge\.completeAppLockBiometric/);
  assert.match(shell, /nativeBridge\.cancelAppLockBiometric/);
  assert.match(plugin, /fun cancelAppLockBiometric/);
  assert.doesNotMatch(shell, /nativeBridge\.authenticateBiometric/);
  const biometricMethod = plugin.slice(plugin.indexOf("fun completeAppLockBiometric"), plugin.indexOf("private fun isConfiguredLockedPackage"));
  const success = biometricMethod.slice(biometricMethod.indexOf("override fun onAuthenticationSucceeded"), biometricMethod.indexOf("override fun onAuthenticationError"));
  assert.ok(success.indexOf("context.startActivity(targetIntent)") < success.indexOf("context.sendBroadcast"));
});


test("extended maintenance uses native immersive bars and a visible owner recovery moon", async () => {
  const screen = await read("src/components/extended-lock-screen.tsx");
  const bridge = await read("src/lib/native-bridge.ts");
  const plugin = await read("android-native/plugin/src/main/java/com/duresssecurity/admin/SecurityAdminPlugin.kt");
  assert.match(screen, /setImmersiveMode\(true\)/);
  assert.match(screen, /setImmersiveMode\(false\)/);
  assert.match(screen, /<Moon className="size-5" \/>/);
  assert.match(screen, /onClick=\{openRecovery\}/);
  assert.match(screen, /ضع كلمة السر لإلغاء وضع الصيانة/);
  assert.match(bridge, /setImmersiveMode\(options: \{ enabled: boolean \}\)/);
  assert.match(plugin, /fun setImmersiveMode/);
  assert.match(plugin, /WindowInsets\.Type\.statusBars\(\) or WindowInsets\.Type\.navigationBars\(\)/);
  assert.match(plugin, /SYSTEM_UI_FLAG_IMMERSIVE_STICKY/);
});

test("uninstall protection is visibly unsupported until Device Owner and stays policy-confirmed", async () => {
  const settings = await read("src/components/settings-screen.tsx");
  const genericToggle = await read("src/components/apps-screen.tsx");
  const plugin = await read("android-native/plugin/src/main/java/com/duresssecurity/admin/SecurityAdminPlugin.kt");
  const store = await read("src/lib/store.ts");
  assert.match(settings, /disabled=\{!deviceOwner && !preventUninstall\}/);
  assert.match(settings, /Device Owner/);
  assert.match(genericToggle, /disabled\?: boolean/);
  assert.match(plugin, /dpm\(\)\.isDeviceOwnerApp\(context\.packageName\)/);
  assert.match(plugin, /dpm\(\)\.isUninstallBlocked\(adminComponent\(\), context\.packageName\) == blocked/);
  assert.match(store, /Android did not confirm the uninstall-block policy/);
});

test("Android asks the owner for only the permission needed by each explicit feature", async () => {
  const store = await read("src/lib/store.ts");
  const settings = await read("src/components/settings-screen.tsx");
  const plugin = await read("android-native/plugin/src/main/java/com/duresssecurity/admin/SecurityAdminPlugin.kt");
  assert.match(store, /requestSystemPermission\("accessibilityPermission"\)/);
  const extended = store.slice(store.indexOf('if (action === "extended-lock")'), store.indexOf('if (action === "duress")'));
  assert.match(extended, /nativeBridge\.requestDeviceAdmin\(\)/);
  assert.match(extended, /nativeBridge\.lockNow\(\)/);
  assert.match(extended, /nativeStatus\?\.deviceSecure/);
  assert.match(settings, /تعذّر فتح إعدادات إمكانية الوصول/);
  assert.doesNotMatch(plugin, /REQUEST_IGNORE_BATTERY_OPTIMIZATIONS/);
  assert.doesNotMatch(plugin, /QUERY_ALL_PACKAGES/);
});

test("native App Lock keypad is not an Android text field or system keyboard", async () => {
  const service = await read("android-native/plugin/src/main/java/com/duresssecurity/admin/AppLockAccessibilityService.kt");
  assert.doesNotMatch(service, /EditText|InputMethodManager|setInputType/);
  assert.match(service, /listOf\("أ", "ي", "ع"\)/);
  assert.match(service, /listOf\("1", "2", "3"\)/);
  assert.match(service, /"back"/);
  assert.match(service, /"ok"/);
  assert.match(service, /dispatchOwnerPinAction\(targetPackage, typed\)/);
});
