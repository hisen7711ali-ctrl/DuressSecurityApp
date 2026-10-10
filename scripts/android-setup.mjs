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
await mkdir(javaDest, { recursive: true });
await mkdir(resDest, { recursive: true });
await mkdir(valuesDest, { recursive: true });
for (const file of ["AdminReceiver.kt", "BootCompletedReceiver.kt", "SecurityAdminPlugin.kt", "SecureStorage.kt", "AppLockAccessibilityService.kt"]) {
  await cp(path.join(root, "android-native/plugin/src/main/java/com/duresssecurity/admin", file), path.join(javaDest, file));
}
for (const file of ["device_admin.xml", "app_lock_accessibility_service.xml"]) {
  await cp(path.join(root, "android-native/plugin/src/main/res/xml", file), path.join(resDest, file));
}
await cp(path.join(root, "android-native/plugin/src/main/res/values/strings.xml"), path.join(valuesDest, "duress_security_strings.xml"));

const manifestPath = path.join(androidDir, "app/src/main/AndroidManifest.xml");
let manifest = await readFile(manifestPath, "utf8");
// Keep PIN/vault data out of Android auto-backup: the AES key is tied to the local Keystore.
manifest = manifest.replace(/<application\b([^>]*)>/, (_match, attributes) => {
  let attrs = attributes;
  if (/android:allowBackup\s*=/.test(attrs)) {
    attrs = attrs.replace(/android:allowBackup\s*=\s*"[^"]*"/, 'android:allowBackup="false"');
  } else {
    attrs += ' android:allowBackup="false"';
  }
  return `<application${attrs}>`;
});
const additions = (await readFile(path.join(root, "android-native/manifest-additions.xml"), "utf8"))
  .replace(/<!--[\s\S]*?-->/g, "")
  .trim();
// Package visibility is restricted on Android 11+. Declare only the launcher
// intent needed by listLaunchableApps(), not QUERY_ALL_PACKAGES.
if (!manifest.includes('android.intent.category.LAUNCHER')) {
  const launcherIntent = `    <intent>\n      <action android:name="android.intent.action.MAIN" />\n      <category android:name="android.intent.category.LAUNCHER" />\n    </intent>\n`;
  if (manifest.includes('<queries>')) {
    manifest = manifest.replace('</queries>', `${launcherIntent}  </queries>`);
  } else {
    manifest = manifest.replace('<application', `  <queries>\n${launcherIntent}  </queries>\n  <application`);
  }
}
const permissions = additions.match(/<uses-permission[\s\S]*?\/>/g) ?? [];
for (const permission of permissions) {
  const name = permission.match(/android:name="([^"]+)"/)?.[1] ?? "__missing__";
  if (!manifest.includes(`android:name="${name}"`)) {
    manifest = manifest.replace("<application", `${permission}\n    <application`);
  }
}
const entries = [
  ...(additions.match(/<receiver[\s\S]*?<\/receiver>/g) ?? []),
  ...(additions.match(/<service[\s\S]*?<\/service>/g) ?? []),
];
for (const entry of entries) {
  const name = entry.match(/android:name="([^"]+)"/)?.[1];
  if (name && !manifest.includes(`android:name="${name}"`)) {
    manifest = manifest.replace("</application>", `    ${entry}\n  </application>`);
  }
}
// Strict offline build: the Android app must not receive INTERNET or network-state
// permissions. The WebView only serves bundled Capacitor assets.
manifest = manifest
  .replace(/\s*<uses-permission\s+android:name="android\.permission\.INTERNET"\s*\/>/g, "")
  .replace(/\s*<uses-permission\s+android:name="android\.permission\.ACCESS_NETWORK_STATE"\s*\/>/g, "");
await writeFile(manifestPath, manifest);

const mainActivity = path.join(androidDir, "app/src/main/java/com/duresssecurity/app/MainActivity.kt");
const javaMainActivity = path.join(androidDir, "app/src/main/java/com/duresssecurity/app/MainActivity.java");
await mkdir(path.dirname(mainActivity), { recursive: true });
await rm(javaMainActivity, { force: true });
await cp(path.join(root, "android-native/mainactivity-patch/MainActivity.kt"), mainActivity);

const gradlePath = path.join(androidDir, "app/build.gradle");
const ktsPath = path.join(androidDir, "app/build.gradle.kts");
const dep = 'implementation "androidx.biometric:biometric:1.1.0"';
if (await access(gradlePath).then(() => true).catch(() => false)) {
  let gradle = await readFile(gradlePath, "utf8");
  if (!gradle.includes("androidx.biometric:biometric")) {
    gradle = gradle.replace(/dependencies\s*\{/, match => `${match}\n    ${dep}`);
    await writeFile(gradlePath, gradle);
  }
} else if (await access(ktsPath).then(() => true).catch(() => false)) {
  let gradle = await readFile(ktsPath, "utf8");
  if (!gradle.includes("androidx.biometric:biometric")) {
    gradle = gradle.replace(/dependencies\s*\{/, match => `${match}\n    implementation("androidx.biometric:biometric:1.1.0")`);
    await writeFile(ktsPath, gradle);
  }
}
console.log("Android native wrapper prepared in strict offline mode. Next run: npm run android:sync, then build/run from Android Studio.");
