import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (p) => readFile(path.join(root, p), "utf8");

test("Capacitor plugin proxy is never awaited or wrapped in Promise.resolve", async () => {
  const bridge = await read("src/lib/native-bridge.ts");
  assert.doesNotMatch(bridge, /await getNativePlugin\(\)/);
  assert.doesNotMatch(bridge, /Promise\.resolve\(registerPlugin/);
  assert.match(bridge, /function getNativePlugin\(\): SecurityAdminNative \| null/);
});

test("secret calculator uses the configurable command and routes successful unlock to Home", async () => {
  const shell = await read("src/components/app-shell.tsx");
  const store = await read("src/lib/store.ts");
  assert.ok(shell.includes("getCalculatorCommand()"));
  assert.ok(shell.includes("sequence !== `${getCalculatorCommand()}=`"));
  assert.ok(!shell.includes("SECRET_CALCULATOR_COMMAND"));
  assert.ok(shell.includes("openSecurityGate()"));
  assert.ok(shell.includes('openOverlay({ kind: "unlock" })'));
  assert.ok(shell.includes('useAppStore.getState().setTab("home")'));
  assert.ok(store.includes('session: "unlocked"'));
  assert.ok(store.includes('tab: "home"'));
});

test("a persisted decoy, lock, or wipe PIN cannot shadow the master PIN", async () => {
  const store = await read("src/lib/store.ts");
  assert.match(store, /Prevent a persisted decoy\/lock\/wipe PIN from taking precedence/);
  assert.match(store, /normalizePin\(next\[kind\]\) === master/);
});
