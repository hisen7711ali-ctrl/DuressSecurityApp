import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => readFile(path.join(root, file), "utf8");

test("Android screen capture protection starts secure and is applied before Recents snapshots", async () => {
  const activity = await read("android-native/mainactivity-patch/MainActivity.kt");
  const plugin = await read("android-native/plugin/src/main/java/com/duresssecurity/admin/SecurityAdminPlugin.kt");
  assert.match(activity, /setScreenCaptureAllowed\(false\)/);
  assert.match(activity, /override fun onPause\(\)[\s\S]*?setScreenCaptureAllowed\(false\)/);
  assert.match(activity, /override fun onResume\(\)[\s\S]*?duress-security-native-foreground/);
  assert.match(plugin, /clearFlags\(WindowManager\.LayoutParams\.FLAG_SECURE\)/);
  assert.match(plugin, /addFlags\(WindowManager\.LayoutParams\.FLAG_SECURE\)/);
});

test("the configured calculator stays capturable until its command is completed, then secures the lock UI", async () => {
  const calculator = await read("src/components/fullscreen-calculator.tsx");
  const shell = await read("src/components/app-shell.tsx");
  assert.ok(calculator.includes("nativeBridge.setScreenCaptureAllowed(false)"));
  assert.ok(calculator.indexOf("nativeBridge.setScreenCaptureAllowed(false)") < calculator.indexOf("props.onSecretCommand?.("));
  assert.match(shell, /const protectedUi = !calculatorFront && ready && session !== "duress"/);
  assert.match(shell, /setScreenCaptureAllowed\(!protectedUi\)/);
  assert.match(shell, /duress-security-native-foreground/);
});
