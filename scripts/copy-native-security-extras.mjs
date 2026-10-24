import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const sourceDir = path.join(root, "android-native/plugin/src/main/java/com/duresssecurity/admin");
const destinationDir = path.join(root, "android/app/src/main/java/com/duresssecurity/admin");

await mkdir(destinationDir, { recursive: true });

for (const file of [
  "SecurityIntegrityPlugin.kt",
  "DirectBootPolicyPlugin.kt",
  "InstalledAppsPlugin.kt",
  "ElevatedShellHelper.kt",
  "TargetAppDataWiper.kt",
]) {
  await cp(path.join(sourceDir, file), path.join(destinationDir, file));
}

// Shizuku is intentionally optional. The app must still build and run without it;
// reflection in ElevatedShellHelper simply returns false when the service is absent.
// 12.2.0 is used here because the project keeps an API 23 minimum.
const gradlePath = path.join(root, "android/app/build.gradle");
let gradle = await readFile(gradlePath, "utf8");
const shizukuDependencies = [
  'implementation "dev.rikka.shizuku:api:12.2.0"',
  'implementation "dev.rikka.shizuku:provider:12.2.0"',
];
for (const dependency of shizukuDependencies) {
  if (!gradle.includes(dependency)) {
    if (/dependencies\s*\{/.test(gradle)) gradle = gradle.replace(/dependencies\s*\{/, match => `${match}\n    ${dependency}`);
    else gradle += `\n\ndependencies {\n    ${dependency}\n}\n`;
  }
}
// Remove stale Shizuku 13.x entries if this script is re-run over an older generated Gradle file.
gradle = gradle
  .replace(/\s*implementation "dev\.rikka\.shizuku:api:13\.1\.5"\n?/g, "\n")
  .replace(/\s*implementation "dev\.rikka\.shizuku:provider:13\.1\.5"\n?/g, "\n");
await writeFile(gradlePath, gradle);
console.log("Native security extras and optional Shizuku dependencies prepared successfully.");
