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
  assert.ok(source.includes("INTERNET"));
  assert.ok(source.includes("ACCESS_NETWORK_STATE"));
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
  assert.match(source, /MainActivity\.kt/);
  assert.match(source, /JavaVersion\.VERSION_21/);
  assert.match(source, /jvmToolchain\(21\)/);
});

test("Android build keeps its configured JVM alignment checks", async () => {
  const build = await read("scripts/build-apk.mjs");
  const align = await read("scripts/align-android-jvm.mjs");
  const debugWorkflow = await read(".github/workflows/android-debug.yml");
  const diagnosticWorkflow = await read(".github/workflows/android-build-diagnostic.yml");
  assert.match(build, /npx[\s\S]*\[\"cap\", \"sync\", \"android\"\]/);
  assert.match(build, /align-android-jvm\.mjs/);
  assert.match(align, /VERSION_21/);
  assert.match(align, /sourceCompatibility[\s\S]*21/);
  assert.match(align, /targetCompatibility[\s\S]*21/);
  assert.match(align, /javaCompiler\s*=\s*javaToolchains\.compilerFor[\s\S]*JavaLanguageVersion\.of\(21\)/);
  assert.match(align, /compilerOptions[\s\S]*JvmTarget\.JVM_21/);
  assert.match(align, /KotlinCompilationTask/);
  assert.match(align, /DURESS_JVM21_ALL_MODULES/);
  assert.match(align, /jvmToolchain\(21\)/);
  assert.doesNotMatch(align, /kotlin\s*\{\s*kotlinOptions\s*\{/);
  assert.doesNotMatch(align, /options\.release\s*(?:=|\.set\s*\()/);
  assert.match(debugWorkflow, /java-version: '21'/);
  assert.match(debugWorkflow, /dump badging/);
  assert.match(debugWorkflow, /application-icon/);
  assert.match(debugWorkflow, /res\/drawable\/ic_launcher/);
  assert.match(debugWorkflow, /com\.duresssecurity\.app\.MainActivity/);
  assert.match(diagnosticWorkflow, /java-version: '21'/);
  assert.match(diagnosticWorkflow, /gradlew --version/);
  assert.match(diagnosticWorkflow, /compileDebugJavaWithJavac/);
  assert.match(diagnosticWorkflow, /compileDebugKotlin/);
});

test("all native Kotlin security classes are copied into the Android app", async () => {
  const source = await read("scripts/android-setup.mjs");
  for (const file of ["AdminReceiver.kt", "BootCompletedReceiver.kt", "SecurityAdminPlugin.kt", "SecureStorage.kt", "AppLockAccessibilityService.kt"]) {
    assert.match(source, new RegExp(file.replace(".", "\\.")));
  }
  assert.match(source, /const mainActivity = path\.join\(androidDir, "app\/src\/main\/java\/com\/duresssecurity\/app\/MainActivity\.kt"\)/);
});

test("calculator branding is a real calculator icon and does not change the security package", async () => {
  const source = await read("scripts/android-setup.mjs");
  assert.match(source, /calculator_app_name/);
  assert.match(source, /@drawable\/ic_launcher/);
  assert.match(source, /@drawable\/ic_launcher_round/);
  assert.match(source, /calculator launcher icon/i);
  assert.match(source, /display panel \+ four keypad buttons/i);
  assert.doesNotMatch(source, /Android robot or a fragile adaptive\/mipmap chain/i);
  assert.ok(source.includes("INTERNET"));
  assert.ok(source.includes("ACCESS_NETWORK_STATE"));
});

test("calculator screen remains a calculator-only presentation layer", async () => {
  const source = await read("src/components/fake-calculator.tsx");
  assert.match(source, /الآلة الحاسبة/);
  assert.match(source, /Calculator/);
  assert.match(source, /evalExpr/);
  assert.match(source, /onSecretCommand/);
  assert.match(source, /OWNER_TRIGGER = \"0×0×0×9\"/);
  assert.ok(source.includes("onSecretCommand?.(OWNER_TRIGGER_FULL)"));
  assert.match(source, /const OWNER_TRIGGER_FULL = `\$\{OWNER_TRIGGER\}=`/);
  assert.match(source, /ownerSequenceRef = useRef\(\"\"\)/);
  assert.doesNotMatch(source, /onOpenOwner/);
  assert.doesNotMatch(source, /fetch\(/);
  assert.doesNotMatch(source, /XMLHttpRequest/);
});
