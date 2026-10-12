import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => readFile(path.join(root, p), 'utf8');

test('calculator is the first ordinary screen and owner entry is hidden behind the exact numeric trigger', async () => {
  const shell = await read('src/components/app-shell.tsx');
  const calculator = await read('src/components/fake-calculator.tsx');
  const icon = await read('scripts/brand-android-icon.mjs');
  const activity = await read('android-native/mainactivity-patch/MainActivity.kt');
  assert.match(shell, /useState\(true\).*calculatorFront|calculatorFront.*useState\(true\)/s);
  assert.match(shell, /SECRET_CALCULATOR_COMMAND.*20272006=/);
  assert.doesNotMatch(shell, /sequence !== SECRET_CALCULATOR_COMMAND \|\| session !== "locked"/);
  assert.match(shell, /if \(sequence !== SECRET_CALCULATOR_COMMAND\) return false/);
  assert.match(shell, /if \(overlay\?\.kind === "unlock"\) return <LockGate \/>/);
  assert.match(shell, /if \(!ready\) return <FakeCalculator onSecretCommand=\{handleCalculatorCommand\} \/>/);
  assert.match(shell, /if \(session === "locked" && calculatorFront\) return <FakeCalculator/);
  assert.match(shell, /if \(!ready\) \{[\s\S]*setCalculatorFront\(true\);\s*setPendingSecurityGate\(true\);/);
  assert.match(shell, /if \(ready && pendingSecurityGate\) \{[\s\S]*if \(session === "locked"\) openOverlay\(\{ kind: "unlock" \}\);/);
  assert.doesNotMatch(shell, /Initializing security|جاري تهيئة الحماية/);
  assert.doesNotMatch(shell, /if \(!ready\) return <LockGate \/>/);
  assert.doesNotMatch(shell, /if \(!ready\)[\s\S]{0,120}return null/);
  assert.match(shell, /if \(session === "duress"\) return <FakeCalculator/);
  assert.match(calculator, /onSecretCommand/);

  const startupCalculatorIndex = shell.indexOf('if (!ready) return <FakeCalculator');
  const unlockOverlayIndex = shell.indexOf('if (overlay?.kind === "unlock") return <LockGate />;');
  assert.ok(startupCalculatorIndex >= 0 && unlockOverlayIndex >= 0);
  assert.ok(startupCalculatorIndex < unlockOverlayIndex, 'startup must remain on the decoy until secure state is ready');

  assert.match(calculator, /OWNER_TRIGGER = "20272006"/);
  assert.match(calculator, /OWNER_TRIGGER_FULL = `\$\{OWNER_TRIGGER\}=`/);
  assert.match(calculator, /ownerSequenceRef/);
  assert.match(calculator, /const sequenceMatches = ownerSequenceRef\.current === OWNER_TRIGGER/);
  assert.match(calculator, /onSecretCommand\?\.\(OWNER_TRIGGER_FULL\)/);
  assert.match(calculator, /if \(!sequenceMatches\) return false/);
  assert.match(calculator, /if \(\/\^\\d\$\/\.test\(key\)\)/);
  assert.doesNotMatch(calculator, /OWNER_TRIGGER = "0×0×0×9"/);
  assert.doesNotMatch(calculator, /normalizeOwnerExpression|isOwnerTriggerExpression/);
  assert.doesNotMatch(calculator, /secretVisible|setSecretVisible|onOpenOwner/);

  assert.match(calculator, /\["AC", "⌫", "%", "÷"\]/);
  assert.match(calculator, /\["1", "2", "3", "\+"\]/);
  assert.match(calculator, /\["±", "\.", "0", "="\]/);
  assert.match(calculator, /if \(key === "⌫"\)/);
  assert.match(calculator, /if \(key === "±"\)/);
  assert.match(calculator, /setDisplay\(next \|\| "0"\)/);
  assert.match(calculator, /wide && "col-span-2 justify-center"/);

  assert.match(activity, /FLAG_SECURE/);
  assert.match(activity, /setScreenCaptureAllowed\(true\)/);
  assert.match(activity, /clearFlags\(WindowManager\.LayoutParams\.FLAG_SECURE\)/);
  assert.match(activity, /addFlags\(WindowManager\.LayoutParams\.FLAG_SECURE\)/);

  assert.match(icon, /calculator-shaped|calculator/);
  assert.match(icon, /<!-- calculator keys -->/);
  assert.match(icon, /<!-- display -->/);
});

test('hidden trigger remains usable while duress mode is active', async () => {
  const shell = await read('src/components/app-shell.tsx');
  const gateIndex = shell.indexOf('if (overlay?.kind === "unlock") return <LockGate />;');
  const duressIndex = shell.indexOf('if (session === "duress") return <FakeCalculator');
  assert.ok(gateIndex >= 0, 'unlock gate must exist');
  assert.ok(duressIndex >= 0, 'duress calculator guard must exist');
  assert.ok(gateIndex < duressIndex, 'unlock gate must have priority over duress calculator');
});

test('vault encrypts data with PBKDF2 and AES-GCM and has no plaintext fallback', async () => {
  const vault = await read('src/lib/vault-crypto.ts');
  const store = await read('src/lib/store.ts');
  assert.match(vault, /PBKDF2-SHA256/);
  assert.match(vault, /310_000/);
  assert.match(vault, /AES-GCM/);
  assert.match(vault, /VAULT_MIN_PASSPHRASE_LENGTH = 12/);
  assert.match(vault, /VAULT_RECORD_MISSING/);
  assert.match(store, /s\.vaultEncrypted \? \{\} : \{ vault: s\.vault \}/);
  assert.match(store, /persistEncryptedVault/);
});

test('retry lockout survives reload through the persisted application state', async () => {
  const store = await read('src/lib/store.ts');
  assert.match(store, /failedAttempts: s\.failedAttempts/);
  assert.match(store, /lockoutUntil: s\.lockoutUntil/);
  assert.match(store, /lockoutLevel: s\.lockoutLevel/);
  assert.match(store, /nextLockoutDelayMs\(state\.lockTimeoutSec, state\.lockoutLevel\)/);
  assert.match(store, /get\(\)\.lockoutUntil > Date\.now\(\)/);
});

test('emergency reset is scoped to application-owned storage, never Android factory reset', async () => {
  const service = await read('src/lib/security-service.ts');
  const plugin = await read('android-native/plugin/src/main/java/com/duresssecurity/admin/SecurityAdminPlugin.kt');
  assert.match(service, /duress-security-vault/);
  assert.match(service, /OWNED_DATABASE_DELETE_BLOCKED/);
  assert.doesNotMatch(plugin, /\.wipeData\s*\(/);
  assert.doesNotMatch(plugin, /FactoryReset/);
});
