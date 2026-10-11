import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => readFile(path.join(root, p), 'utf8');

test('calculator is the first ordinary screen and owner entry is hidden behind the exact trigger', async () => {
  const shell = await read('src/components/app-shell.tsx');
  const calculator = await read('src/components/fake-calculator.tsx');
  const icon = await read('scripts/brand-android-icon.mjs');
  assert.match(shell, /useState\(true\).*calculatorFront|calculatorFront.*useState\(true\)/s);
  assert.match(shell, /calculatorFront && session === "locked"/);
  assert.match(shell, /SECRET_CALCULATOR_COMMAND.*0×0×0×9=/);
  assert.doesNotMatch(shell, /sequence !== SECRET_CALCULATOR_COMMAND \|\| session !== "locked"/);
  assert.match(shell, /if \(sequence !== SECRET_CALCULATOR_COMMAND\) return false/);
  assert.match(calculator, /onSecretCommand/);

  // Exact hidden owner trigger: clean calculator -> 0 -> × -> 0 -> × -> 0 -> × -> 9 -> =.
  // It immediately calls the security gate; there is no visible reveal button.
  assert.match(calculator, /OWNER_TRIGGER = "0×0×0×9"/);
  assert.match(calculator, /candidate = key === "=" \? expr : `\$\{expr\}\$\{key\}`/);
  assert.match(calculator, /OWNER_TRIGGER\.startsWith\(candidate\)/);
  assert.match(calculator, /expr === OWNER_TRIGGER/);
  assert.match(calculator, /onSecretCommand\?\.\(`\$\{OWNER_TRIGGER\}=`\)/);
  assert.doesNotMatch(calculator, /secretVisible|setSecretVisible|onOpenOwner/);

  // Zero is a normal centered wide calculator key, not a stretched/right-aligned label.
  assert.match(calculator, /wide && "col-span-2 justify-center"/);

  // Launcher branding must visibly be a calculator, not a shield, robot, or generic mark.
  assert.match(icon, /calculator-shaped|calculator/);
  assert.match(icon, /<!-- calculator keys -->/);
  assert.match(icon, /<!-- display -->/);
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
