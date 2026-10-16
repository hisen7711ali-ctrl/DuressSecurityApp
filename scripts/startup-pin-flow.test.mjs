import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (p) => readFile(path.join(root, p), "utf8");

test("default 0000 PIN auto-submits immediately after the fourth digit", async () => {
  const security = await read("src/lib/security-service.ts");
  const gate = await read("src/components/lock-gate.tsx");
  assert.match(security, /master: "0000"/);
  assert.match(security, /if \(typed === normalizePin\(pins\.master\)\) return "unlock"/);
  assert.match(gate, /if \(next\.length === 4\) window\.setTimeout\(\(\) => finish\(next\), 80\)/);
});

test("fresh startup keeps the calculator visible while secure initialization retries in the background", async () => {
  const shell = await read("src/components/app-shell.tsx");
  const storage = await read("src/lib/app-storage.ts");
  const activity = await read("android-native/mainactivity-patch/MainActivity.kt");
  const plugin = await read("android-native/plugin/src/main/java/com/duresssecurity/admin/SecurityAdminPlugin.kt");
  assert.match(shell, /const hydrateWithRetry = async/);
  assert.match(shell, /await hydrateSession\(\)/);
  assert.match(shell, /STARTUP_RETRY_DELAY_MS = 3000/);
  assert.match(shell, /STARTUP_MAX_RETRIES = 2/);
  assert.match(storage, /STARTUP_MAX_ATTEMPTS = 12/);
  assert.match(shell, /if \(!ready\) return <FakeCalculator onSecretCommand=\{handleCalculatorCommand\} \/>/);
  assert.match(shell, /STARTUP_HYDRATION_WATCHDOG_MS = 80000/);
  assert.match(shell, /session: "storage-error"/);
  assert.doesNotMatch(shell, /Initializing security|جاري تهيئة الحماية/);
  assert.match(activity, /DuressSecureWarmup/);
  assert.match(plugin, /secureStorageExecutor/);
});

test("calculator trigger is the exact 20272006= sequence and opens the normal PIN gate", async () => {
  const shell = await read("src/components/app-shell.tsx");
  const calculator = await read("src/components/fake-calculator.tsx");
  assert.match(shell, /SECRET_CALCULATOR_COMMAND = "20272006="/);
  assert.match(shell, /if \(sequence !== SECRET_CALCULATOR_COMMAND\) return false/);
  assert.match(shell, /openSecurityGate\(true\)/);
  assert.match(shell, /setSettingsEntryRequested\(true\)/);
  assert.match(shell, /setTab\("settings"\)/);
  assert.match(shell, /if \(pendingSecurityGate\) return <LockGate \/>/);
  assert.doesNotMatch(shell, /session: "unlocked"/);
  assert.doesNotMatch(shell, /useAppStore\.setState\(\{[^}]*session: "unlocked"/s);
  assert.match(calculator, /OWNER_TRIGGER = "20272006"/);
  assert.match(calculator, /OWNER_TRIGGER_FULL = `\$\{OWNER_TRIGGER\}=`/);
  assert.match(calculator, /onSecretCommand\?\.\(OWNER_TRIGGER_FULL\)/);
});

test("native plugin is registered synchronously so awaiting the Capacitor proxy cannot deadlock on then()", async () => {
  const bridge = await read("src/lib/native-bridge.ts");
  assert.match(bridge, /let nativePlugin: SecurityAdminNative \| null \| undefined/);
  assert.match(bridge, /function getNativePlugin\(\): SecurityAdminNative \| null/);
  assert.match(bridge, /nativePlugin \?\?= registerPlugin<SecurityAdminNative>\("SecurityAdmin"\)/);
  assert.doesNotMatch(bridge, /Promise\.resolve\(registerPlugin<SecurityAdminNative>\("SecurityAdmin"\)\)/);
});
