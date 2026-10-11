import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => readFile(path.join(root, relative), "utf8");

test("offline guard allows no remote host", async () => {
  const source = await read("src/lib/network-guard.ts");
  assert.match(source, /parsed\.origin === location\.origin/);
  assert.doesNotMatch(source, /grok\.com/);
  assert.doesNotMatch(source, /\.grok\.com/);
});

test("offline Android setup strips network permissions", async () => {
  const source = await read("scripts/android-setup.mjs");
  assert.ok(source.includes('INTERNET'));
  assert.ok(source.includes('ACCESS_NETWORK_STATE'));
});

test("offline manifest additions do not request internet access", async () => {
  const source = await read("android-native/manifest-additions.xml");
  assert.doesNotMatch(source, /android\.permission\.INTERNET/);
  assert.doesNotMatch(source, /android\.permission\.ACCESS_NETWORK_STATE/);
});

test("Android setup explicitly compiles Kotlin native classes", async () => {
  const source = await read("scripts/android-setup.mjs");
  assert.match(source, /org\.jetbrains\.kotlin\.android/);
  assert.match(source, /version \"2\.0\.21\" apply false/);
  assert.match(source, /jvmToolchain\(17\)/);
  assert.match(source, /MainActivity\.kt/);
});

test("Android JVM alignment avoids a Java --release conflict", async () => {
  const source = await read("scripts/align-android-jvm.mjs");
  assert.match(source, /JavaVersion\.VERSION_17/);
  assert.match(source, /kotlinOptions/);
  assert.match(source, /jvmTarget/);
  assert.match(source, /17/);
  assert.match(source, /options\.release/);
  assert.doesNotMatch(source, /jvmToolchain\(17\)/);
});

test("all native Kotlin security classes are copied into the Android app", async () => {
  const source = await read("scripts/android-setup.mjs");
  for (const file of ["AdminReceiver.kt", "BootCompletedReceiver.kt", "SecurityAdminPlugin.kt", "SecureStorage.kt", "AppLockAccessibilityService.kt"]) {
    assert.match(source, new RegExp(file.replace(".", "\\.")));
  }
  assert.match(source, /const mainActivity = path\.join\(androidDir, "app\/src\/main\/java\/com\/duresssecurity\/app\/MainActivity\.kt"\)/);
});

test("calculator branding stays Android-safe and does not change the security package", async () => {
  const source = await read("scripts/android-setup.mjs");
  assert.match(source, /calculator_app_name/);
  assert.match(source, /@drawable\/ic_launcher/);
  assert.match(source, /@drawable\/ic_launcher_round/);
  assert.ok(source.includes('INTERNET'));
  assert.ok(source.includes('ACCESS_NETWORK_STATE'));
});

test("calculator screen remains a calculator-only presentation layer", async () => {
  const source = await read("src/components/fake-calculator.tsx");
  assert.match(source, /الآلة الحاسبة/);
  assert.match(source, /Calculator/);
  assert.match(source, /evalExpr/);
  assert.match(source, /onOpenOwner/);
  assert.doesNotMatch(source, /fetch\(/);
  assert.doesNotMatch(source, /XMLHttpRequest/);
});
