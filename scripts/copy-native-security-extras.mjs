import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const sourceDir = path.join(root, "android-native/plugin/src/main/java/com/duresssecurity/admin");
const destinationDir = path.join(root, "android/app/src/main/java/com/duresssecurity/admin");

await mkdir(destinationDir, { recursive: true });

// android-setup.mjs copies the core native files. These companion plugins/helpers
// are also required before Gradle compiles MainActivity/SecurityAdminPlugin.
for (const file of [
  "SecurityIntegrityPlugin.kt",
  "DirectBootPolicyPlugin.kt",
  "InstalledAppsPlugin.kt",
  "ElevatedShellHelper.kt",
  "TargetAppDataWiper.kt",
]) {
  await cp(path.join(sourceDir, file), path.join(destinationDir, file));
}

console.log("Native security extras copied successfully.");
