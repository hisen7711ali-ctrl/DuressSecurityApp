import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => readFile(path.join(root, p), 'utf8');

test('calculator remains the ordinary startup screen and its secret command follows saved settings', async () => {
  const shell = await read('src/components/app-shell.tsx');
  const calculator = await read('src/components/fake-calculator.tsx');
  const wrapper = await read('src/components/fullscreen-calculator.tsx');
  const activity = await read('android-native/mainactivity-patch/MainActivity.kt');
  assert.match(shell, /calculatorFront, setCalculatorFront\\] = useState\\(true\\)/);
  assert.ok(shell.includes('getCalculatorCommand()'));
  assert.ok(shell.includes('sequence !== `${getCalculatorCommand()}=`'));
  assert.doesNotMatch(shell, /SECRET_CALCULATOR_COMMAND/);
  assert.match(shell, /securityGateFlow\\.current = true/);
  assert.match(shell, /setCalculatorFront\\(false\\)/);
  assert.match(shell, /setPendingSecurityGate\\(true\\)/);
  assert.match(shell, /openOverlay\\(\\{ kind: "unlock" \\}\\)/);
  assert.match(shell, /if \\(!ready\\) return <FakeCalculator/);
  assert.match(shell, /if \\(session === "locked" && calculatorFront\\) return <FakeCalculator/);
  assert.match(shell, /if \\(pendingSecurityGate\\) return <LockGate \\/>/);
  assert.match(shell, /if \\(overlay\\?\\.kind === "unlock"\\) return <LockGate \\/>/);
  assert.ok(wrapper.includes('sequenceRef.current === calculatorCommand'));
  assert.ok(wrapper.includes('props.onSecretCommand?.(`${calculatorCommand}=`)'));
  assert.ok(!calculator.includes('OWNER_TRIGGER'));
  assert.ok(!calculator.includes('20272006'));
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
  assert.match(vault, /persistEncryptedAttachment/);
  assert.match(vault, /openEncryptedAttachment/);
  assert.match(vault, /ATTACHMENT_CHUNK_SIZE = 1024 \* 1024/);
  assert.match(vault, /additionalData: asBufferSource\(attachmentAad\(id, index, meta\.totalChunks, meta\.mimeType, meta\.size\)\)/);
  assert.match(store, /persistEncryptedVault/);
  assert.match(store, /deleteEncryptedAttachment/);
  assert.match(store, /vaultEncrypted: false/);
  const files = await read("src/components/files-screen.tsx");
  assert.match(files, /type="file"/);
  assert.match(files, /persistEncryptedAttachment/);
  assert.match(files, /openEncryptedAttachment/);
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
