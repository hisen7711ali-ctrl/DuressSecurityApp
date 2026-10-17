import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { ARGON2ID_ITERATIONS, ARGON2ID_MEMORY_KIB, ARGON2ID_PARALLELISM, VAULT_MIN_PASSPHRASE_LENGTH, VAULT_RECOMMENDED_PASSPHRASE_LENGTH, VAULT_STORAGE_KEY, LEGACY_VAULT_STORAGE_KEY, lockEncryptedVaultSession, unlockOrCreateEncryptedVault } from "./vault-crypto.ts";

const values = new Map<string, string>();
const storage = { get length() { return values.size; }, key(index: number) { return [...values.keys()][index] ?? null; }, getItem(key: string) { return values.get(key) ?? null; }, setItem(key: string, value: string) { values.set(key, String(value)); }, removeItem(key: string) { values.delete(key); }, clear() { values.clear(); } };
Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
const sample = [{ id: "test-1", title: "PRIVATE_TITLE_91", body: "PRIVATE_BODY_73", updatedAt: "2026-10-10T00:00:00.000Z" }];
const passphrase = "Long vault passphrase 2026!";

test("v3 vault uses Argon2id with authenticated parameters and stores no plaintext", async () => {
  values.clear(); lockEncryptedVaultSession();
  await unlockOrCreateEncryptedVault("1234", sample);
  const raw = storage.getItem(VAULT_STORAGE_KEY) ?? ""; const envelope = JSON.parse(raw);
  assert.equal(envelope.version, 3); assert.equal(envelope.kdf, "ARGON2ID-V1.3+DEVICE-SECRET");
  assert.equal(envelope.memoryKiB, ARGON2ID_MEMORY_KIB); assert.equal(envelope.iterations, ARGON2ID_ITERATIONS); assert.equal(envelope.parallelism, ARGON2ID_PARALLELISM);
  assert.equal(typeof envelope.aad, "string"); assert.ok(!raw.includes("PRIVATE_TITLE_91")); assert.ok(!raw.includes("PRIVATE_BODY_73"));
  assert.equal(VAULT_MIN_PASSPHRASE_LENGTH, 1); assert.ok(VAULT_RECOMMENDED_PASSPHRASE_LENGTH >= 12);
});

test("v3 vault locks and reopens; wrong passphrase fails closed", async () => {
  values.clear(); lockEncryptedVaultSession(); await unlockOrCreateEncryptedVault(passphrase, sample);
  lockEncryptedVaultSession();
  await assert.rejects(unlockOrCreateEncryptedVault("Wrong passphrase 2026!", [], false), /VAULT_PASSPHRASE_OR_INTEGRITY_ERROR/);
  const opened = await unlockOrCreateEncryptedVault(passphrase, [], false); assert.deepEqual(opened, sample);
});

test("tampering with authenticated header fails closed", async () => {
  values.clear(); lockEncryptedVaultSession(); await unlockOrCreateEncryptedVault(passphrase, sample); const envelope = JSON.parse(storage.getItem(VAULT_STORAGE_KEY) ?? "{}"); envelope.aad = envelope.aad.slice(0, -4) + "AAAA"; storage.setItem(VAULT_STORAGE_KEY, JSON.stringify(envelope)); lockEncryptedVaultSession(); await assert.rejects(unlockOrCreateEncryptedVault(passphrase, [], false), /VAULT_PASSPHRASE_OR_INTEGRITY_ERROR|VAULT_RECORD_INVALID/);
});

test("tampered ciphertext is rejected instead of yielding an empty vault", async () => {
  values.clear(); lockEncryptedVaultSession(); await unlockOrCreateEncryptedVault(passphrase, sample); const envelope = JSON.parse(storage.getItem(VAULT_STORAGE_KEY) ?? "{}"); envelope.ciphertext = envelope.ciphertext.slice(0, -4) + "AAAA"; storage.setItem(VAULT_STORAGE_KEY, JSON.stringify(envelope)); lockEncryptedVaultSession(); await assert.rejects(unlockOrCreateEncryptedVault(passphrase, [], false));
});

test("a missing encrypted record cannot silently create a replacement when migration is complete", async () => {
  values.clear(); lockEncryptedVaultSession(); await assert.rejects(unlockOrCreateEncryptedVault(passphrase, [], false), /VAULT_RECORD_MISSING/); assert.equal(storage.getItem(VAULT_STORAGE_KEY), null); assert.equal(storage.getItem(LEGACY_VAULT_STORAGE_KEY), null);
});
