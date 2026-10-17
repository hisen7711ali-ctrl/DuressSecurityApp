import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => readFile(path.join(root, file), "utf8");

test("calculator command is stored through secure app storage with the original default", async () => {
  const module = await read("src/lib/calculator-command.ts");
  assert.match(module, /DEFAULT_CALCULATOR_COMMAND = "20272006"/);
  assert.match(module, /duress-security-app:calculator-command/);
  assert.match(module, /getStoredValue\(CALCULATOR_COMMAND_STORAGE_KEY\)/);
  assert.match(module, /setStoredValue\(CALCULATOR_COMMAND_STORAGE_KEY, normalized\)/);
  assert.match(module, /if \(stored === null\) cachedCommand = DEFAULT_CALCULATOR_COMMAND/);
  assert.match(module, /resetCalculatorCommand\(\)/);
  assert.match(module, /\\d\{8\}/);
});

test("calculator settings require the master PIN and reject security-PIN reuse", async () => {
  const panel = await read("src/components/pins-panel.tsx");
  assert.match(panel, /رمز فتح الحاسبة/);
  assert.match(panel, /رمز المالك للتأكيد/);
  assert.match(panel, /normalizedMaster !== normalizeCalculatorCommand\(pins\.master\)/);
  assert.match(panel, /securityPins\.includes\(normalizedNew\)/);
  assert.match(panel, /تم تغيير رمز فتح الحاسبة/);
});

test("calculator unlock follows the currently stored command in every calculator surface", async () => {
  const calculator = await read("src/components/fake-calculator.tsx");
  const fullscreen = await read("src/components/fullscreen-calculator.tsx");
  const shell = await read("src/components/app-shell.tsx");
  assert.match(calculator, /secretCommand = DEFAULT_CALCULATOR_COMMAND/);
  assert.match(calculator, /secretCommand\.startsWith\(next\)/);
  assert.match(calculator, /onSecretCommand\?\.\(`\$\{secretCommand\}=`\)/);
  assert.match(fullscreen, /loadCalculatorCommand\(\)/);
  assert.match(fullscreen, /secretCommand=\{calculatorCommand\}/);
  assert.match(shell, /getCalculatorCommand\(\)/);
  assert.match(shell, /if \(sequence !== `\$\{getCalculatorCommand\(\)\}=`\) return false/);
  const wipe = await read("src/components/wipe-screen.tsx");
  assert.match(wipe, /resetCalculatorCommand\(\)/);
  assert.match(wipe, /duress-security-app:calculator-command/);
  assert.match(wipe, /duress-security-app-lock-background-image/);
  assert.doesNotMatch(calculator, /OWNER_TRIGGER = "20272006"/);
  assert.doesNotMatch(fullscreen, /LEGACY_CALCULATOR_COMMAND/);
});
