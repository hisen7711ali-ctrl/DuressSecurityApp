import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const run = (cmd, args, cwd = root) => new Promise((resolve, reject) => {
  const p = spawn(cmd, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
  p.on("error", reject);
  p.on("exit", code => code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`)));
});

try {
  // android-setup.mjs is the single source of truth for Android Java/Kotlin
  // compiler targets. Do not post-process its Gradle output with a second
  // JVM-alignment pass, because that can reintroduce incompatible target or
  // --release combinations after Capacitor sync.
  await run(process.execPath, ["scripts/android-setup.mjs"]);
  await run("npx", ["cap", "sync", "android"]);
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
