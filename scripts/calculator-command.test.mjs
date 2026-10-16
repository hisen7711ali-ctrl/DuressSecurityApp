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

test("calculator intercepts the configurable command and swallows the old command", async () => {
  const calculator = await read("src/components/fullscreen-calculator.tsx");
  assert.match(calculator, /getCalculatorCommand\(\)/);
  assert.match(calculator, /sequenceRef\.current === calculatorCommand/);
  assert.match(calculator, /sequenceRef\.current === LEGACY_CALCULATOR_COMMAND/);
  assert.match(calculator, /if \(configuredMatch\) props\.onSecretCommand/);
  assert.match(calculator, /old value is deliberately swallowed/);
});
