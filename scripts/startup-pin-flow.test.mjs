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

test("fresh startup initializes automatically and has no blocking initialization screen", async () => {
  const shell = await read("src/components/app-shell.tsx");
  assert.match(shell, /const finish = \(\) => \{ void hydrateSession\(\); \};/);
  assert.match(shell, /if \(useAppStore\.persist\.hasHydrated\(\)\) finish\(\);/);
  assert.match(shell, /if \(!ready\) return <FakeCalculator onSecretCommand=\{handleCalculatorCommand\} \/>/);
  assert.doesNotMatch(shell, /Initializing security|جاري تهيئة الحماية/);
});

test("calculator trigger is the exact 20272006= sequence and opens the security gate", async () => {
  const shell = await read("src/components/app-shell.tsx");
  const calculator = await read("src/components/fake-calculator.tsx");
  assert.match(shell, /SECRET_CALCULATOR_COMMAND = "20272006="/);
  assert.match(shell, /if \(sequence !== SECRET_CALCULATOR_COMMAND\) return false/);
  assert.match(shell, /openSecurityGate\(\)/);
  assert.match(shell, /setPendingSecurityGate\(true\)/);
  assert.match(shell, /openOverlay\(\{ kind: "unlock" \}\)/);
  assert.match(shell, /if \(pendingSecurityGate && !ready\) \{/);
  assert.match(shell, /Preparing the security gate/);
  assert.match(shell, /if \(pendingSecurityGate\) return <LockGate \/>/);
  assert.match(calculator, /OWNER_TRIGGER = "20272006"/);
  assert.match(calculator, /OWNER_TRIGGER_FULL = `\$\{OWNER_TRIGGER\}=`/);
  assert.match(calculator, /onSecretCommand\?\.\(OWNER_TRIGGER_FULL\)/);
});
