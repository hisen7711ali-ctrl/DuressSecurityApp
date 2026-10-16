import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const run = (cmd, args, cwd = root) => new Promise((resolve, reject) => {
  // Avoid passing Node's Program Files path through cmd.exe. Batch files
  // such as gradlew.bat still need the Windows shell.
  const p = spawn(cmd, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32" && cmd !== process.execPath,
  });
  p.on("error", reject);
  p.on("exit", code => code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`)));
});

try {
  // android-setup.mjs performs the single Capacitor sync and all post-sync
  // native patching/branding. Do not sync or JVM-align a second time here:
  // Capacitor sync can overwrite the exact files we just hardened.
  await run(process.execPath, ["scripts/android-setup.mjs"]);
  const androidDir = path.join(root, "android");
  const wrapper = path.join(androidDir, process.platform === "win32" ? "gradlew.bat" : "gradlew");
  await access(wrapper);
  await run(wrapper, ["assembleDebug"], androidDir);
  console.log("Debug APK created at android/app/build/outputs/apk/debug/app-debug.apk");
} catch (error) {
  console.error("APK build failed. Check the first Gradle/Android SDK error above.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
