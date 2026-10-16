import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => readFile(path.join(root, file), "utf8");

test("extended lock uses maintenance copy and hides normal recovery UI", async () => {
  const source = await read("src/components/extended-lock-screen.tsx");
  assert.match(source, /التطبيق قيد الصيانة/);
  assert.match(source, /30 يوماً/);
  assert.match(source, /left-\[15%\] top-\[3\.5rem\]/);
  assert.doesNotMatch(source, /ShieldCheck/);
});

test("device-level controls are not blocked by a test-device UI check", async () => {
  const source = await read("src/components/settings-screen.tsx");
  assert.match(source, /action: \{ type: "toggle-prevent", value \}/);
  assert.match(source, /action: \{ type: "toggle-kiosk", value \}/);
  assert.doesNotMatch(source, /if \(!deviceOwner\) \{\s*setToast\(t\.deviceOwnerOnly/);
});

test("native app-lock gate does not dismiss on its own overlay package event", async () => {
  const source = await read("android-native/plugin/src/main/java/com/duresssecurity/admin/AppLockAccessibilityService.kt");
  assert.match(source, /if \(lockView == null\) \{\s*currentTarget = null/);
  assert.match(source, /override fun onInterrupt\(\) \{[\s\S]*Do not remove/);
});
