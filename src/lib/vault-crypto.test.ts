import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import {
  VAULT_MIN_PASSPHRASE_LENGTH,
  VAULT_STORAGE_KEY,
  lockEncryptedVaultSession,
  persistEncryptedVault,
  unlockOrCreateEncryptedVault,
} from "./vault-crypto.ts";

const values = new Map<string, string>();
const storage = {
  get length() { return values.size; },
  key(index: number) { return [...values.keys()][index] ?? null; },
  getItem(key: string) { return values.get(key) ?? null; },
  setItem(key: string, value: string) { values.set(key, String(value)); },
  removeItem(key: string) { values.delete(key); },
  clear() { values.clear(); },
};
Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });

const sample = [{ id: "test-1", title: "PRIVATE_TITLE_91", body: "PRIVATE_BODY_73", updatedAt: "2026-10-10T00:00:00.000Z" }];
const passphrase = "Long vault passphrase 2026!";

test("vault requires a strong passphrase and stores ciphertext, not plaintext", async () => {
  values.clear();
  lockEncryptedVaultSession();
  await assert.rejects(unlockOrCreateEncryptedVault("1234", sample), /PASSPHRASE_TOO_SHORT/);
  await unlockOrCreateEncryptedVault(passphrase, sample);
  const raw = storage.getItem(VAULT_STORAGE_KEY) ?? "";
  assert.ok(raw.length > 100);
  assert.ok(!raw.includes("PRIVATE_TITLE_91"));
  assert.ok(!raw.includes("PRIVATE_BODY_73"));
  assert.equal(JSON.parse(raw).version, 1);
});

test("vault can be locked and reopened; wrong passphrase fails closed", async () => {
  lockEncryptedVaultSession();
  await assert.rejects(unlockOrCreateEncryptedVault("Wrong passphrase 2026!", [], false), /VAULT_PASSPHRASE_OR_INTEGRITY_ERROR/);
  const opened = await unlockOrCreateEncryptedVault(passphrase, [], false);
  assert.deepEqual(opened, sample);
});

test("a missing encrypted record cannot silently create a replacement when migration is complete", async () => {
  lockEncryptedVaultSession();
  values.delete(VAULT_STORAGE_KEY);
  await assert.rejects(unlockOrCreateEncryptedVault(passphrase, [], false), /VAULT_RECORD_MISSING/);
  assert.ok(VAULT_MIN_PASSPHRASE_LENGTH >= 12);
});

test("tampered ciphertext is rejected instead of yielding an empty vault", async () => {
  values.clear();
  lockEncryptedVaultSession();
  await unlockOrCreateEncryptedVault(passphrase, sample);
  const envelope = JSON.parse(storage.getItem(VAULT_STORAGE_KEY) ?? "{}");
  envelope.ciphertext = envelope.ciphertext.slice(0, -4) + "AAAA";
  storage.setItem(VAULT_STORAGE_KEY, JSON.stringify(envelope));
  lockEncryptedVaultSession();
  await assert.rejects(unlockOrCreateEncryptedVault(passphrase, [], false));
});
