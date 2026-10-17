import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => readFile(path.join(root, file), "utf8");

test("calculator trigger uses the configurable command and opens the security gate", async () => {
  const shell = await read("src/components/app-shell.tsx");
  const calculator = await read("src/components/fake-calculator.tsx");
  const command = await read("src/lib/calculator-command.ts");
  assert.match(shell, /getCalculatorCommand\(\)/);
  assert.match(shell, /if \(sequence !== `\$\{getCalculatorCommand\(\)\}=`\) return false/);
  assert.match(shell, /openSecurityGate\(\)/);
  assert.match(shell, /setPendingSecurityGate\(true\)/);
  assert.match(shell, /openOverlay\(\{ kind: "unlock" \}\)/);
  assert.match(shell, /if \(pendingSecurityGate\) return <LockGate \/>/);
  assert.match(calculator, /DEFAULT_CALCULATOR_COMMAND/);
  assert.match(calculator, /secretCommand\.startsWith\(next\)/);
  assert.match(command, /DEFAULT_CALCULATOR_COMMAND = "20272006"/);
});