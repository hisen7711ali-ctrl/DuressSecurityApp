import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => readFile(path.join(root, p), 'utf8');

test('calculator is the ordinary startup screen and owner entry uses the exact numeric trigger', async () => {
  const shell = await read('src/components/app-shell.tsx');
  const calculator = await read('src/components/fake-calculator.tsx');
  const activity = await read('android-native/mainactivity-patch/MainActivity.kt');
  assert.match(shell, /calculatorFront, setCalculatorFront\] = useState\(true\)/);
  assert.match(shell, /getCalculatorCommand\(\)/);
  assert.match(shell, /sequence !== `\$\{getCalculatorCommand\(\)\}=`/);
  assert.doesNotMatch(shell, /SECRET_CALCULATOR_COMMAND = "20272006="/);
  assert.match(shell, /securityGateFlow\.current = true/);
  assert.match(shell, /setCalculatorFront\(false\)/);
  assert.match(shell, /setPendingSecurityGate\(true\)/);
  assert.match(shell, /openOverlay\(\{ kind: "unlock" \}\)/);
  assert.match(shell, /if \(!ready\) return <FakeCalculator/);
  assert.match(shell, /if \(session === "locked" && calculatorFront\) return <FakeCalculator/);
  assert.match(shell, /if \(pendingSecurityGate\) return <LockGate \/>/);
  assert.match(shell, /if \(overlay\?\.kind === "unlock"\) return <LockGate \/>/);
  assert.match(calculator, /OWNER_TRIGGER = "20272006"/);
  assert.match(calculator, /OWNER_TRIGGER_FULL = `\$\{OWNER_TRIGGER\}=`/);
  assert.match(calculator, /ownerSequenceRef/);
  assert.match(calculator, /onSecretCommand\?\.\(OWNER_TRIGGER_FULL\)/);
  assert.match(activity, /FLAG_SECURE/);
});

test('hidden trigger remains usable while duress mode is active', async () => {
  const shell = await read('src/components/app-shell.tsx');
  assert.match(shell, /if \(session === "duress"\) return <FakeCalculator/);
  assert.match(shell, /sequence !== `\$\{getCalculatorCommand\(\)\}=`/);
});

test('vault v2 uses PBKDF2 600k, AES-GCM, device secret and authenticated header with no plaintext fallback', async () => {
  const vault = await read('src/lib/vault-crypto.ts');
  const store = await read('src/lib/store.ts');
  const nativeStorage = await read('android-native/plugin/src/main/java/com/duresssecurity/admin/SecureStorage.kt');
  assert.match(nativeStorage, /val key = getExistingKey\(\)/);
  assert.match(nativeStorage, /SECURE_STORAGE_KEY_MISSING/);
  assert.match(nativeStorage, /DEVICE_SECRET_BYTES = 32/);
  assert.match(vault, /PBKDF2_ITERATIONS = 600_000/);
  assert.match(vault, /PBKDF2-SHA256\+DEVICE-SECRET/);
  assert.match(vault, /VAULT_DEVICE_SECRET_KEY/);
  assert.match(vault, /additionalData/);
  assert.match(vault, /LEGACY_VAULT_STORAGE_KEY/);
  assert.match(vault, /verifyV2/);
  assert.match(vault, /VAULT_RECORD_MISSING/);
  assert.match(store, /persistEncryptedVault/);
  assert.match(store, /vaultEncrypted: false/);
});

test('retry lockout survives reload through persisted application state', async () => {
  const store = await read('src/lib/store.ts');
  assert.match(store, /failedAttempts: s\.failedAttempts/);
  assert.match(store, /lockoutUntil: s\.lockoutUntil/);
  assert.match(store, /lockoutLevel: s\.lockoutLevel/);
  assert.match(store, /nextLockoutDelayMs\(state\.lockTimeoutSec, state\.lockoutLevel\)/);
});

test('emergency reset is scoped to app-owned storage', async () => {
  const plugin = await read('android-native/plugin/src/main/java/com/duresssecurity/admin/SecurityAdminPlugin.kt');
  assert.doesNotMatch(plugin, /\.wipeData\s*\(/);
  assert.doesNotMatch(plugin, /FactoryReset/);
});
