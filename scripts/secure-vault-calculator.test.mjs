import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => readFile(path.join(root, p), 'utf8');

test('calculator remains the ordinary startup screen and its secret command follows saved settings', async () => {
  const shell = await read('src/components/app-shell.tsx');
  const baseCalculator = await read('src/components/fake-calculator.tsx');
  const wrapper = await read('src/components/fullscreen-calculator.tsx');
  const activity = await read('android-native/mainactivity-patch/MainActivity.kt');
  assert.ok(shell.includes('calculatorFront, setCalculatorFront] = useState(true)'));
  assert.ok(shell.includes('getCalculatorCommand()'));
  assert.ok(shell.includes('sequence !== `${getCalculatorCommand()}=`'));
  assert.ok(!shell.includes('SECRET_CALCULATOR_COMMAND'));
  assert.ok(shell.includes('securityGateFlow.current = true'));
  assert.ok(shell.includes('setCalculatorFront(false)'));
  assert.ok(shell.includes('setPendingSecurityGate(true)'));
  assert.ok(shell.includes('openOverlay({ kind: "unlock" })'));
  assert.ok(shell.includes('if (!ready) return <FakeCalculator'));
  assert.ok(shell.includes('if (session === "locked" && calculatorFront) return <FakeCalculator'));
  assert.ok(shell.includes('if (pendingSecurityGate) return <LockGate />'));
  assert.ok(shell.includes('if (overlay?.kind === "unlock") return <LockGate />'));
  assert.ok(wrapper.includes('sequenceRef.current === calculatorCommand'));
  assert.ok(wrapper.includes('button?.getAttribute("aria-label")?.trim() || button?.textContent?.trim()'));
  assert.ok(baseCalculator.includes('aria-label={label === "⌫" ? "Delete" : label === "±" ? "Toggle sign" : label}'));
  assert.ok(wrapper.includes('calculatorCommandReady'));
  assert.ok(!baseCalculator.includes('OWNER_TRIGGER'));
  assert.ok(!baseCalculator.includes('20272006'));
  assert.ok(activity.includes('FLAG_SECURE'));
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

test('emergency reset restores first-run defaults without attempting a device factory reset', async () => {
  const plugin = await read('android-native/plugin/src/main/java/com/duresssecurity/admin/SecurityAdminPlugin.kt');
  assert.doesNotMatch(plugin, /\.wipeData\s*\(/);
  assert.doesNotMatch(plugin, /FactoryReset/);
  const store = await read('src/lib/store.ts');
  assert.ok(store.includes('lang: "ar", theme: "dark", backgroundImage: null, pins: { ...DEFAULT_PINS }'));
  assert.ok(store.includes('maxAttempts: 3, lockTimeoutSec: 20, failedAttempts: 0, lockoutUntil: 0, lockoutLevel: 0'));
  assert.ok(store.includes('homeLockEnabled: true, appLockEnabled: true, overlayEnabled: true'));
  const wipeScreen = await read('src/components/wipe-screen.tsx');
  const secureStorage = await read('android-native/plugin/src/main/java/com/duresssecurity/admin/SecureStorage.kt');
  assert.ok(wipeScreen.includes('result.reason === "KEY_MISSING"'));
  assert.ok(wipeScreen.includes("if (result.available)"));
  assert.ok(wipeScreen.includes("if (result.found) return false"));
  assert.ok(secureStorage.includes("preferences.edit().clear().commit()"));
  assert.ok(secureStorage.includes("deleteEntry(KEY_ALIAS)"));
});
