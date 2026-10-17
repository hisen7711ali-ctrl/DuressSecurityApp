import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (p) => readFile(path.join(root, p), "utf8");

test("default 0000 auto-submits immediately while configured PIN lengths remain supported", async () => {
  const security = await read("src/lib/security-service.ts");
  const gate = await read("src/components/lock-gate.tsx");
  assert.match(security, /master: "0000"/);
  assert.match(security, /if \(typed === normalizePin\(pins\.master\)\) return "unlock"/);
  assert.match(gate, /if \(next\.length > value\.length && shouldAutoSubmit\(next\)\) window\.setTimeout\(\(\) => finish\(next\), 80\)/);
  assert.match(gate, /return candidate\.length === pinLength \|\| matchesExistingPin\(candidate\)/);
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

test("calculator trigger follows the configured command and opens the security gate", async () => {
  const shell = await read("src/components/app-shell.tsx");
  const calculator = await read("src/components/fake-calculator.tsx");
  assert.ok(shell.includes("getCalculatorCommand()"));
  assert.ok(shell.includes("sequence !== `${getCalculatorCommand()}=`"));
  assert.ok(!shell.includes("SECRET_CALCULATOR_COMMAND"));
  assert.ok(shell.includes("openSecurityGate()"));
  assert.ok(shell.includes("setPendingSecurityGate(true)"));
  assert.ok(shell.includes('openOverlay({ kind: "unlock" })'));
  assert.ok(shell.includes('if (pendingSecurityGate) return <LockGate />'));
  assert.ok(!calculator.includes("OWNER_TRIGGER"));
  assert.ok(!calculator.includes("20272006"));
});