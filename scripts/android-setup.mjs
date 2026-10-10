import { cp, mkdir, readFile, writeFile, access, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const androidDir = path.join(root, "android");
const run = (cmd, args, env = process.env) => new Promise((resolve, reject) => {
  const p = spawn(cmd, args, { cwd: root, env, stdio: "inherit", shell: process.platform === "win32" });
  p.on("error", reject);
  p.on("exit", code => code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`)));
});

try {
  await access(path.join(root, "node_modules", "@capacitor", "cli"));
} catch {
  console.error("Capacitor packages are missing. Run npm install first (internet access required).");
  process.exit(1);
}

await run(process.execPath, ["scripts/build-mobile.mjs"]);
if (!(await access(androidDir).then(() => true).catch(() => false))) {
  await run("npx", ["cap", "add", "android"]);
}

const javaDest = path.join(androidDir, "app/src/main/java/com/duresssecurity/admin");
const resDest = path.join(androidDir, "app/src/main/res/xml");
const valuesDest = path.join(androidDir, "app/src/main/res/values");
const drawableDest = path.join(androidDir, "app/src/main/res/drawable");
await mkdir(javaDest, { recursive: true });
await mkdir(resDest, { recursive: true });
await mkdir(valuesDest, { recursive: true });
await mkdir(drawableDest, { recursive: true });

for (const file of ["AdminReceiver.kt", "BootCompletedReceiver.kt", "SecurityAdminPlugin.kt", "SecureStorage.kt", "AppLockAccessibilityService.kt"]) {
  await cp(path.join(root, "android-native/plugin/src/main/java/com/duresssecurity/admin", file), path.join(javaDest, file));
}
for (const file of ["device_admin.xml", "app_lock_accessibility_service.xml"]) {
  await cp(path.join(root, "android-native/plugin/src/main/res/xml", file), path.join(resDest, file));
}
const nativeStrings = await readFile(path.join(root, "android-native/plugin/src/main/res/values/strings.xml"), "utf8");
await writeFile(path.join(valuesDest, "duress_security_strings.xml"), nativeStrings);
await writeFile(path.join(valuesDest, "calculator_branding.xml"), `<resources>\n  <string name="calculator_app_name">الآلة الحاسبة</string>\n</resources>\n`);

const iconXml = `<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path android:fillColor="#E8EAED" android:pathData="M18,5L90,5Q103,5 103,18L103,90Q103,103 90,103L18,103Q5,103 5,90L5,18Q5,5 18,5Z"/>
    <path android:fillColor="#5F6368" android:pathData="M23,14L85,14Q91,14 91,20L91,88Q91,94 85,94L23,94Q17,94 17,88L17,20Q17,14 23,14Z"/>
    <path android:fillColor="#F8F9FA" android:pathData="M24,20L84,20Q87,20 87,23L87,38Q87,41 84,41L24,41Q21,41 21,38L21,23Q21,20 24,20Z"/>
    <path android:fillColor="#9AA0A6" android:pathData="M25,46L38,46Q41,46 41,49L41,58Q41,61 38,61L25,61Q22,61 22,58L22,49Q22,46 25,46Z"/>
    <path android:fillColor="#9AA0A6" android:pathData="M48,46L61,46Q64,46 64,49L64,58Q64,61 61,61L48,61Q45,61 45,58L45,49Q45,46 48,46Z"/>
    <path android:fillColor="#9AA0A6" android:pathData="M71,46L84,46Q87,46 87,49L87,58Q87,61 84,61L71,61Q68,61 68,58L68,49Q68,46 71,46Z"/>
    <path android:fillColor="#9AA0A6" android:pathData="M25,65L38,65Q41,65 41,68L41,77Q41,80 38,80L25,80Q22,80 22,77L22,68Q22,65 25,65Z"/>
    <path android:fillColor="#9AA0A6" android:pathData="M48,65L61,65Q64,65 64,68L64,77Q64,80 61,80L48,80Q45,80 45,77L45,68Q45,65 48,65Z"/>
    <path android:fillColor="#9AA0A6" android:pathData="M71,65L84,65Q87,65 87,68L87,77Q87,80 84,80L71,80Q68,80 68,77L68,68Q68,65 71,65Z"/>
    <path android:fillColor="#9AA0A6" android:pathData="M25,84L38,84Q41,84 41,87L41,89Q41,92 38,92L25,92Q22,92 22,89L22,87Q22,84 25,84Z"/>
    <path android:fillColor="#9AA0A6" android:pathData="M48,84L61,84Q64,84 64,87L64,89Q64,92 61,92L48,92Q45,92 45,89L45,87Q45,84 48,84Z"/>
    <path android:fillColor="#F9AB00" android:pathData="M71,84L84,84Q87,84 87,87L87,89Q87,92 84,92L71,92Q68,92 68,89L68,87Q68,84 71,84Z"/>
</vector>
`;
await writeFile(path.join(drawableDest, "ic_launcher.xml"), iconXml);
await writeFile(path.join(drawableDest, "ic_launcher_round.xml"), iconXml);

const manifestPath = path.join(androidDir, "app/src/main/AndroidManifest.xml");
let manifest = await readFile(manifestPath, "utf8");
manifest = manifest.replace(/<application\b([^>]*)>/, (_match, attributes) => {
  let attrs = attributes;
  if (/android:allowBackup\s*=/.test(attrs)) attrs = attrs.replace(/android:allowBackup\s*=\s*"[^"]*"/, 'android:allowBackup="false"');
  else attrs += ' android:allowBackup="false"';
  if (/android:label\s*=/.test(attrs)) attrs = attrs.replace(/android:label\s*=\s*"[^"]*"/, 'android:label="@string/calculator_app_name"');
  else attrs += ' android:label="@string/calculator_app_name"';
  if (/android:icon\s*=/.test(attrs)) attrs = attrs.replace(/android:icon\s*=\s*"[^"]*"/, 'android:icon="@drawable/ic_launcher"');
  else attrs += ' android:icon="@drawable/ic_launcher"';
  if (/android:roundIcon\s*=/.test(attrs)) attrs = attrs.replace(/android:roundIcon\s*=\s*"[^"]*"/, 'android:roundIcon="@drawable/ic_launcher_round"');
  else attrs += ' android:roundIcon="@drawable/ic_launcher_round"';
  return `<application${attrs}>`;
});
const additions = (await readFile(path.join(root, "android-native/manifest-additions.xml"), "utf8")).replace(/<!--[\s\S]*?-->/g, "").trim();
if (!manifest.includes('android.intent.category.LAUNCHER')) {
  const launcherIntent = `    <intent>\n      <action android:name="android.intent.action.MAIN" />\n      <category android:name="android.intent.category.LAUNCHER" />\n    </intent>\n`;
  if (manifest.includes("<queries>")) manifest = manifest.replace("</queries>", `${launcherIntent}  </queries>`);
  else manifest = manifest.replace("<application", `  <queries>\n${launcherIntent}  </queries>\n  <application`);
}
const permissions = additions.match(/<uses-permission[\s\S]*?\/>/g) ?? [];
for (const permission of permissions) {
  const name = permission.match(/android:name="([^"]+)"/)?.[1] ?? "__missing__";
  if (!manifest.includes(`android:name="${name}"`)) manifest = manifest.replace("<application", `${permission}\n    <application`);
}
const entries = [
  ...(additions.match(/<receiver[\s\S]*?<\/receiver>/g) ?? []),
  ...(additions.match(/<service[\s\S]*?<\/service>/g) ?? []),
];
for (const entry of entries) {
  const name = entry.match(/android:name="([^"]+)"/)?.[1];
  if (name && !manifest.includes(`android:name="${name}"`)) manifest = manifest.replace("</application>", `    ${entry}\n  </application>`);
}
manifest = manifest
  .replace(/\s*<uses-permission\s+android:name="android\.permission\.INTERNET"\s*\/>/g, "")
  .replace(/\s*<uses-permission\s+android:name="android\.permission\.ACCESS_NETWORK_STATE"\s*\/>/g, "");
await writeFile(manifestPath, manifest);

const rootGradlePath = path.join(androidDir, "build.gradle");
if (await access(rootGradlePath).then(() => true).catch(() => false)) {
  let rootGradle = await readFile(rootGradlePath, "utf8");
  const kotlinClasspath = '    classpath "org.jetbrains.kotlin:kotlin-gradle-plugin:2.0.21"\n';
  if (/buildscript\s*\{[\s\S]*?dependencies\s*\{/.test(rootGradle)) {
    if (!rootGradle.includes("org.jetbrains.kotlin:kotlin-gradle-plugin")) rootGradle = rootGradle.replace(/(buildscript\s*\{[\s\S]*?dependencies\s*\{)/, `$1\n${kotlinClasspath}`);
  } else if (!rootGradle.includes("org.jetbrains.kotlin.android")) {
    rootGradle = `plugins {\n    id "org.jetbrains.kotlin.android" version "2.0.21" apply false\n}\n\n${rootGradle}`;
  }
  await writeFile(rootGradlePath, rootGradle);
}

const mainActivity = path.join(androidDir, "app/src/main/java/com/duresssecurity/app/MainActivity.kt");
const javaMainActivity = path.join(androidDir, "app/src/main/java/com/duresssecurity/app/MainActivity.java");
await mkdir(path.dirname(mainActivity), { recursive: true });
await rm(javaMainActivity, { force: true });
await cp(path.join(root, "android-native/mainactivity-patch/MainActivity.kt"), mainActivity);

const gradlePath = path.join(androidDir, "app/build.gradle");
const ktsPath = path.join(androidDir, "app/build.gradle.kts");
if (await access(gradlePath).then(() => true).catch(() => false)) {
  let gradle = await readFile(gradlePath, "utf8");
  if (!gradle.includes("org.jetbrains.kotlin.android")) gradle = gradle.replace(/plugins\s*\{/, match => `${match}\n    id "org.jetbrains.kotlin.android"`);
  if (!gradle.includes("kotlinOptions")) gradle = gradle.replace(/android\s*\{/, match => `${match}\n    kotlinOptions { jvmTarget = "17" }`);
  if (!gradle.includes("minSdkVersion 23")) gradle = gradle.replace(/defaultConfig\s*\{/, match => `${match}\n        minSdkVersion 23`);
  if (!gradle.includes("androidx.biometric:biometric")) gradle = gradle.replace(/dependencies\s*\{/, match => `${match}\n    implementation "androidx.biometric:biometric:1.1.0"`);
  await writeFile(gradlePath, gradle);
} else if (await access(ktsPath).then(() => true).catch(() => false)) {
  let gradle = await readFile(ktsPath, "utf8");
  if (!gradle.includes("org.jetbrains.kotlin.android")) gradle = gradle.replace(/plugins\s*\{/, match => `${match}\n    id("org.jetbrains.kotlin.android")`);
  if (!gradle.includes("kotlinOptions")) gradle = gradle.replace(/android\s*\{/, match => `${match}\n    kotlinOptions { jvmTarget = "17" }`);
  if (!gradle.includes("minSdk = 23")) gradle = gradle.replace(/defaultConfig\s*\{/, match => `${match}\n        minSdk = 23`);
  if (!gradle.includes("androidx.biometric:biometric")) gradle = gradle.replace(/dependencies\s*\{/, match => `${match}\n    implementation("androidx.biometric:biometric:1.1.0")`);
  await writeFile(ktsPath, gradle);
}
console.log("Android native wrapper prepared in strict offline mode with explicit Kotlin compilation and calculator branding. Next run: npm run android:sync, then build/run from Android Studio.");
