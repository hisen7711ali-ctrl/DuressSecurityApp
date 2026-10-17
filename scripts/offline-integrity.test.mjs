import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => readFile(path.join(root, relative), "utf8");
const includes = (source, text) => assert.ok(source.includes(text), `Expected source to contain: ${text}`);
const excludes = (source, text) => assert.ok(!source.includes(text), `Expected source not to contain: ${text}`);

test("offline guard allows no remote host", async () => {
  const source = await read("src/lib/network-guard.ts");
  includes(source, "parsed.origin === location.origin");
  excludes(source, "grok.com");
  excludes(source, ".grok.com");
});

test("offline Android setup strips network permissions", async () => {
  const source = await read("scripts/android-setup.mjs");
  includes(source, "INTERNET");
  includes(source, "ACCESS_NETWORK_STATE");
});

test("offline manifest additions do not request internet access", async () => {
  const source = await read("android-native/manifest-additions.xml");
  excludes(source, "android.permission.INTERNET");
  excludes(source, "android.permission.ACCESS_NETWORK_STATE");
});

test("Android setup explicitly compiles Kotlin native classes", async () => {
  const source = await read("scripts/android-setup.mjs");
  includes(source, "org.jetbrains.kotlin.android");
  includes(source, 'version "2.0.21" apply false');
  includes(source, "MainActivity.kt");
  includes(source, "JavaVersion.VERSION_21");
  includes(source, "jvmToolchain(21)");
});

test("Android setup injects all required native manifest permissions and components", async () => {
  const source = await read("scripts/android-setup.mjs");
  for (const permission of [
    "USE_BIOMETRIC",
    "RECEIVE_BOOT_COMPLETED",
    "POST_NOTIFICATIONS",
    "SYSTEM_ALERT_WINDOW",
    "PACKAGE_USAGE_STATS",
  ]) includes(source, `android.permission.${permission}`);

  for (const component of ["AdminReceiver", "BootCompletedReceiver", "AppLockAccessibilityService"]) {
    includes(source, `com.duresssecurity.admin.${component}`);
  }

  includes(source, "BIND_DEVICE_ADMIN");
  includes(source, "BIND_ACCESSIBILITY_SERVICE");
  includes(source, "@xml/device_admin");
  includes(source, "@xml/app_lock_accessibility_service");
});

test("APK build uses one setup pass and does not re-sync or re-align native Gradle", async () => {
  const build = await read("scripts/build-apk.mjs");
  includes(build, "scripts/android-setup.mjs");
  excludes(build, '["cap", "sync", "android"]');
  excludes(build, "align-android-jvm.mjs");
});

test("Android debug workflow verifies the actual final APK", async () => {
  const debugWorkflow = await read(".github/workflows/android-debug.yml");
  includes(debugWorkflow, "dump permissions");
  includes(debugWorkflow, "dump xmltree");
  includes(debugWorkflow, "USE_BIOMETRIC");
  includes(debugWorkflow, "QUERY_ALL_PACKAGES");
  includes(debugWorkflow, "AdminReceiver");
  includes(debugWorkflow, "AppLockAccessibilityService");
  includes(debugWorkflow, "application-icon");
  includes(debugWorkflow, "res/drawable/ic_launcher");
  includes(debugWorkflow, "com.duresssecurity.app.MainActivity");
  includes(debugWorkflow, "name: duress-security-debug-apk");
});

test("all native Kotlin security classes are copied into the Android app", async () => {
  const source = await read("scripts/android-setup.mjs");
  for (const file of [
    "AdminReceiver.kt",
    "BootCompletedReceiver.kt",
    "SecurityAdminPlugin.kt",
    "SecureStorage.kt",
    "AppLockAccessibilityService.kt",
  ]) includes(source, file);

  includes(
    source,
    'const mainActivity = path.join(androidDir, "app/src/main/java/com/duresssecurity/app/MainActivity.kt")',
  );
});

test("calculator branding is a real calculator icon and does not change the security package", async () => {
  const source = await read("scripts/android-setup.mjs");
  includes(source, "calculator_app_name");
  includes(source, "@drawable/ic_launcher");
  includes(source, "@drawable/ic_launcher_round");
  includes(source, "calculator launcher icon");
  includes(source, "display panel + four keypad buttons");
  excludes(source, "Android robot or a fragile adaptive/mipmap chain");
  includes(source, "INTERNET");
  includes(source, "ACCESS_NETWORK_STATE");
});

test("calculator screen remains a calculator-only presentation layer", async () => {
  const source = await read("src/components/fake-calculator.tsx");
  const wrapper = await read("src/components/fullscreen-calculator.tsx");
  includes(source, "الآلة الحاسبة");
  includes(source, "Calculator");
  includes(source, "evalExpr");
  includes(source, 'if (key === "⌫")');
  includes(source, 'if (key === "±")');
  excludes(source, "OWNER_TRIGGER");
  excludes(source, "20272006");
  includes(wrapper, "getCalculatorCommand()");
  includes(wrapper, "sequenceRef.current === calculatorCommand");
  includes(wrapper, "props.onSecretCommand");
  excludes(source, "fetch(");
  excludes(source, "XMLHttpRequest");
});
