import { cp, mkdir, readFile, writeFile, access, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const androidDir = path.join(root, "android");
const run = (cmd, args) => new Promise((resolve, reject) => {
  const p = spawn(cmd, args, { cwd: root, env: process.env, stdio: "inherit", shell: process.platform === "win32" });
  p.on("error", reject);
  p.on("exit", code => code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`)));
});
const exists = p => access(p).then(() => true).catch(() => false);

if (!(await exists(path.join(root, "node_modules", "@capacitor", "cli")))) {
  console.error("Capacitor packages are missing. Run npm install first.");
  process.exit(1);
}

await run(process.execPath, ["scripts/build-mobile.mjs"]);
if (!(await exists(androidDir))) await run("npx", ["cap", "add", "android"]);

const javaDest = path.join(androidDir, "app/src/main/java/com/duresssecurity/admin");
const resDest = path.join(androidDir, "app/src/main/res/xml");
const valuesDest = path.join(androidDir, "app/src/main/res/values");
const drawableDest = path.join(androidDir, "app/src/main/res/drawable");
await Promise.all([mkdir(javaDest, { recursive: true }), mkdir(resDest, { recursive: true }), mkdir(valuesDest, { recursive: true }), mkdir(drawableDest, { recursive: true })]);

for (const file of ["AdminReceiver.kt", "BootCompletedReceiver.kt", "SecurityAdminPlugin.kt", "SecureStorage.kt", "AppLockAccessibilityService.kt"]) {
  await cp(path.join(root, "android-native/plugin/src/main/java/com/duresssecurity/admin", file), path.join(javaDest, file));
}
for (const file of ["device_admin.xml", "app_lock_accessibility_service.xml"]) {
  await cp(path.join(root, "android-native/plugin/src/main/res/xml", file), path.join(resDest, file));
}
await writeFile(path.join(valuesDest, "duress_security_strings.xml"), await readFile(path.join(root, "android-native/plugin/src/main/res/values/strings.xml"), "utf8"));
await writeFile(path.join(valuesDest, "calculator_branding.xml"), `<resources>\n  <string name="calculator_app_name">الآلة الحاسبة</string>\n</resources>\n`);

// Single-source professional calculator launcher icon. The visible identity is deliberately
// a calculator: display panel + four keypad buttons, with no Android robot or security shield.
const iconXml = `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
<path android:fillColor="#071426" android:pathData="M20,3h68c10.5,0 17,6.5 17,17v68c0,10.5 -6.5,17 -17,17H20C9.5,105 3,98.5 3,88V20C3,9.5 9.5,3 20,3Z"/>
<path android:fillColor="#F8FAFC" android:pathData="M28,19h52c4.4,0 8,3.6 8,8v54c0,4.4 -3.6,8 -8,8H28c-4.4,0 -8,-3.6 -8,-8V27c0,-4.4 3.6,-8 8,-8Z"/>
<path android:fillColor="#0B1B31" android:pathData="M28,27h52c0,0 0,0 0,0v17c0,2.2 -1.8,4 -4,4H32c-2.2,0 -4,-1.8 -4,-4V27Z"/>
<path android:fillColor="#23C7D9" android:pathData="M34,32h40v7H34z"/>
<path android:fillColor="#0B1B31" android:pathData="M31,54h12v10H31zM48,54h12v10H48zM65,54h12v10H65zM31,69h12v10H31zM48,69h12v10H48zM65,69h12v10H65z"/>
</vector>`;
await writeFile(path.join(drawableDest, "ic_launcher.xml"), iconXml);
await writeFile(path.join(drawableDest, "ic_launcher_round.xml"), iconXml);

const manifestPath = path.join(androidDir, "app/src/main/AndroidManifest.xml");
let manifest = await readFile(manifestPath, "utf8");
manifest = manifest.replace(/<application\b([^>]*)>/, (_, attrs0) => {
  let attrs = attrs0;
  const set = (name, value) => {
    const re = new RegExp(`android:${name}\\s*=\\s*"[^"]*"`);
    attrs = re.test(attrs) ? attrs.replace(re, `android:${name}="${value}"`) : `${attrs} android:${name}="${value}"`;
  };
  set("allowBackup", "false");
  set("label", "@string/calculator_app_name");
  set("icon", "@drawable/ic_launcher");
  set("roundIcon", "@drawable/ic_launcher_round");
  return `<application${attrs}>`;
});
manifest = manifest.replace(/\s*<uses-permission\s+android:name="android\.permission\.(?:INTERNET|ACCESS_NETWORK_STATE)"\s*\/>/g, "");
if (!manifest.includes("android.intent.category.LAUNCHER")) throw new Error("Generated Android manifest is missing the launcher category");
await writeFile(manifestPath, manifest);

const rootGradlePath = path.join(androidDir, "build.gradle");
if (await exists(rootGradlePath)) {
  let rootGradle = await readFile(rootGradlePath, "utf8");
  if (/buildscript\s*\{[\s\S]*?dependencies\s*\{/.test(rootGradle)) {
    if (!rootGradle.includes("org.jetbrains.kotlin:kotlin-gradle-plugin")) {
      rootGradle = rootGradle.replace(/(buildscript\s*\{[\s\S]*?dependencies\s*\{)/, `$1\n    classpath "org.jetbrains.kotlin:kotlin-gradle-plugin:2.0.21"`);
    }
  } else if (!rootGradle.includes("org.jetbrains.kotlin.android")) {
    rootGradle = `plugins { id "org.jetbrains.kotlin.android" version "2.0.21" apply false }\n\n${rootGradle}`;
  }
  await writeFile(rootGradlePath, rootGradle);
}

const mainActivity = path.join(androidDir, "app/src/main/java/com/duresssecurity/app/MainActivity.kt");
await mkdir(path.dirname(mainActivity), { recursive: true });
await rm(path.join(androidDir, "app/src/main/java/com/duresssecurity/app/MainActivity.java"), { force: true });
await cp(path.join(root, "android-native/mainactivity-patch/MainActivity.kt"), mainActivity);

const gradlePath = path.join(androidDir, "app/build.gradle");
if (await exists(gradlePath)) {
  let gradle = await readFile(gradlePath, "utf8");
  if (!gradle.includes("org.jetbrains.kotlin.android")) {
    const rootGradle = await readFile(rootGradlePath, "utf8");
    if (/kotlin-gradle-plugin/.test(rootGradle)) gradle += `\napply plugin: "org.jetbrains.kotlin.android"\n`;
    else gradle = gradle.replace(/plugins\s*\{/, m => `${m}\n    id "org.jetbrains.kotlin.android" version "2.0.21"`);
  }
  if (!/compileSdk(?:Version)?\s+35/.test(gradle)) gradle = gradle.replace(/android\s*\{/, m => `${m}\n    compileSdk 35`);
  if (!gradle.includes("targetSdkVersion 35")) gradle = gradle.replace(/defaultConfig\s*\{/, m => `${m}\n        targetSdkVersion 35`);
  if (!gradle.includes("minSdkVersion 23")) gradle = gradle.replace(/defaultConfig\s*\{/, m => `${m}\n        minSdkVersion 23`);
  if (!gradle.includes("compileOptions")) gradle = gradle.replace(/android\s*\{/, m => `${m}\n    compileOptions { sourceCompatibility JavaVersion.VERSION_21; targetCompatibility JavaVersion.VERSION_21 }`);
  if (!gradle.includes("androidx.biometric:biometric")) gradle = gradle.replace(/dependencies\s*\{/, m => `${m}\n    implementation "androidx.biometric:biometric:1.1.0"`);
  if (!gradle.includes("jvmToolchain")) gradle += `\n\nkotlin { jvmToolchain(21) }\n`;
  await writeFile(gradlePath, gradle);
}

console.log("Android native wrapper prepared with Kotlin compilation, API 23+ compatibility, Java/Kotlin 21 targets, strict offline manifest, and calculator launcher branding.");
