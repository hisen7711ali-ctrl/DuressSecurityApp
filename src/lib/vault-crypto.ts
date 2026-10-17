/** Device-bound encrypted vault: PBKDF2-SHA-256 (600k) + Android Keystore-backed 256-bit secret + AES-256-GCM. */
import * as nativeBridge from "./native-bridge.ts";

export type EncryptedVaultFile = { id: string; title: string; body: string; updatedAt: string };
type VaultEnvelopeV1 = { version: 1; kdf: "PBKDF2-SHA256"; iterations: number; salt: string; iv: string; ciphertext: string };
type VaultEnvelopeV2 = { version: 2; kdf: "PBKDF2-SHA256+DEVICE-SECRET"; iterations: number; salt: string; iv: string; aad: string; ciphertext: string };
type VaultEnvelope = VaultEnvelopeV1 | VaultEnvelopeV2;
export const VAULT_STORAGE_KEY = "duress-security-vault-v2";
export const LEGACY_VAULT_STORAGE_KEY = "duress-security-vault-v1";
export const VAULT_MIN_PASSPHRASE_LENGTH = 12;
export const PBKDF2_ITERATIONS = 600_000;
export const VAULT_VERSION = 2;
export const VAULT_DEVICE_SECRET_KEY = "duress-security-vault-device-secret";
const AES_IV_BYTES = 12; const SALT_BYTES = 16; const DEVICE_SECRET_BYTES = 32; const MIGRATION_KEY = `${VAULT_STORAGE_KEY}:migration`;
let activeKey: CryptoKey | null = null; let activeSalt: Uint8Array | null = null; let activeVersion = 0;
function webCrypto(): Crypto { if (!globalThis.crypto?.subtle || !globalThis.crypto.getRandomValues) throw new Error("WEBCRYPTO_UNAVAILABLE"); return globalThis.crypto; }
function localStore(): Storage { if (typeof globalThis.localStorage === "undefined") throw new Error("SECURE_STORAGE_UNAVAILABLE"); return globalThis.localStorage; }
function encodeBase64(bytes: Uint8Array): string { let binary = ""; for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!); return btoa(binary); }
function decodeBase64(value: string): Uint8Array { const binary = atob(value); const out = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i); return out; }
function asBufferSource(bytes: Uint8Array): BufferSource { return bytes as unknown as BufferSource; }
function validateFiles(value: unknown): value is EncryptedVaultFile[] { return Array.isArray(value) && value.every((row) => row && typeof row === "object" && typeof row.id === "string" && typeof row.title === "string" && typeof row.body === "string" && typeof row.updatedAt === "string"); }
function parseEnvelope(raw: string): VaultEnvelope { let value: unknown; try { value = JSON.parse(raw); } catch { throw new Error("VAULT_RECORD_INVALID"); } if (!value || typeof value !== "object") throw new Error("VAULT_RECORD_INVALID"); const e = value as { version?: number; kdf?: string; iterations?: number; salt?: string; iv?: string; aad?: string; ciphertext?: string }; if (e.version === 1 && e.kdf === "PBKDF2-SHA256" && Number.isInteger(e.iterations) && (e.iterations ?? 0) >= 100_000 && typeof e.salt === "string" && typeof e.iv === "string" && typeof e.ciphertext === "string") return e as VaultEnvelopeV1; if (e.version === 2 && e.kdf === "PBKDF2-SHA256+DEVICE-SECRET" && e.iterations === PBKDF2_ITERATIONS && typeof e.salt === "string" && typeof e.iv === "string" && typeof e.aad === "string" && typeof e.ciphertext === "string") return e as VaultEnvelopeV2; throw new Error("VAULT_RECORD_INVALID"); }
async function derivePasswordBits(passphrase: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> { const material = await webCrypto().subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveBits"]); return new Uint8Array(await webCrypto().subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: asBufferSource(salt), iterations }, material, 256)); }
function decodeAndValidateDeviceSecret(value: string): Uint8Array { let secret: Uint8Array; try { secret = decodeBase64(value); } catch { throw new Error("VAULT_DEVICE_SECRET_INVALID"); } if (secret.length !== DEVICE_SECRET_BYTES) throw new Error("VAULT_DEVICE_SECRET_INVALID"); return secret; }
async function getDeviceSecret(): Promise<Uint8Array | null> { if (!nativeBridge.isNativeAndroid()) return null; let result = await nativeBridge.secureStorageGet(VAULT_DEVICE_SECRET_KEY); if (result.available && result.found && result.value) return decodeAndValidateDeviceSecret(result.value); if (result.available && !result.found) { const initialized = await nativeBridge.initializeSecureStorage(); if (initialized) { result = await nativeBridge.secureStorageGet(VAULT_DEVICE_SECRET_KEY); if (result.available && result.found && result.value) return decodeAndValidateDeviceSecret(result.value); } } if (!result.available) throw new Error(result.reason === "KEY_MISSING" ? "VAULT_DEVICE_SECRET_MISSING" : "VAULT_DEVICE_SECRET_UNAVAILABLE"); throw new Error("VAULT_DEVICE_SECRET_MISSING"); }
async function deriveV2Key(passphrase: string, salt: Uint8Array): Promise<CryptoKey> { const passwordBits = await derivePasswordBits(passphrase, salt, PBKDF2_ITERATIONS); const deviceSecret = await getDeviceSecret(); const combined = new Uint8Array(passwordBits.length + (deviceSecret?.length ?? 0)); combined.set(passwordBits, 0); if (deviceSecret) combined.set(deviceSecret, passwordBits.length); const digest = new Uint8Array(await webCrypto().subtle.digest("SHA-256", asBufferSource(combined))); passwordBits.fill(0); if (deviceSecret) deviceSecret.fill(0); combined.fill(0); return webCrypto().subtle.importKey("raw", asBufferSource(digest), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]); }
async function deriveV1Key(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> { const bits = await derivePasswordBits(passphrase, salt, iterations); try { return await webCrypto().subtle.importKey("raw", asBufferSource(bits), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]); } finally { bits.fill(0); } }
function v2Aad(salt: Uint8Array): Uint8Array { return new TextEncoder().encode(`duress-vault-v2|PBKDF2-SHA256+DEVICE-SECRET|${PBKDF2_ITERATIONS}|${encodeBase64(salt)}`); }
async function encryptV2(files: EncryptedVaultFile[], passphrase: string): Promise<{ envelope: VaultEnvelopeV2; key: CryptoKey; salt: Uint8Array }> { if (!passphrase) throw new Error("PASSPHRASE_REQUIRED"); if (passphrase.length < VAULT_MIN_PASSPHRASE_LENGTH) throw new Error("PASSPHRASE_TOO_SHORT"); const salt = webCrypto().getRandomValues(new Uint8Array(SALT_BYTES)); const key = await deriveV2Key(passphrase, salt); const iv = webCrypto().getRandomValues(new Uint8Array(AES_IV_BYTES)); const aad = v2Aad(salt); const plain = new TextEncoder().encode(JSON.stringify(files)); const encrypted = await webCrypto().subtle.encrypt({ name: "AES-GCM", iv: asBufferSource(iv), additionalData: asBufferSource(aad), tagLength: 128 }, key, asBufferSource(plain)); plain.fill(0); return { key, salt, envelope: { version: 2, kdf: "PBKDF2-SHA256+DEVICE-SECRET", iterations: PBKDF2_ITERATIONS, salt: encodeBase64(salt), iv: encodeBase64(iv), aad: encodeBase64(aad), ciphertext: encodeBase64(new Uint8Array(encrypted)) } }; }
async function decryptEnvelope(envelope: VaultEnvelope, passphrase: string): Promise<{ files: EncryptedVaultFile[]; key: CryptoKey; salt: Uint8Array; version: number }> { const salt = decodeBase64(envelope.salt); const iv = decodeBase64(envelope.iv); const ciphertext = decodeBase64(envelope.ciphertext); if (salt.length !== SALT_BYTES || iv.length !== AES_IV_BYTES || ciphertext.length < 16) throw new Error("VAULT_RECORD_INVALID"); const isV2 = envelope.version === 2; const key = isV2 ? await deriveV2Key(passphrase, salt) : await deriveV1Key(passphrase, salt, envelope.iterations); try { if (isV2) { const aad = decodeBase64(envelope.aad); if (aad.length < 16 || encodeBase64(aad) !== envelope.aad || new TextDecoder().decode(aad) !== new TextDecoder().decode(v2Aad(salt))) throw new Error("VAULT_RECORD_INVALID"); const clear = new Uint8Array(await webCrypto().subtle.decrypt({ name: "AES-GCM", iv: asBufferSource(iv), additionalData: asBufferSource(aad), tagLength: 128 }, key, asBufferSource(ciphertext))); const parsed: unknown = JSON.parse(new TextDecoder().decode(clear)); clear.fill(0); if (!validateFiles(parsed)) throw new Error("VAULT_RECORD_INVALID"); return { files: parsed, key, salt, version: 2 }; } const clear = new Uint8Array(await webCrypto().subtle.decrypt({ name: "AES-GCM", iv: asBufferSource(iv), tagLength: 128 }, key, asBufferSource(ciphertext))); const parsed: unknown = JSON.parse(new TextDecoder().decode(clear)); clear.fill(0); if (!validateFiles(parsed)) throw new Error("VAULT_RECORD_INVALID"); return { files: parsed, key, salt, version: 1 }; } catch (error) { if (error instanceof Error && ["VAULT_RECORD_INVALID", "VAULT_DEVICE_SECRET_MISSING", "VAULT_DEVICE_SECRET_UNAVAILABLE", "VAULT_DEVICE_SECRET_INVALID"].includes(error.message)) throw error; throw new Error("VAULT_PASSPHRASE_OR_INTEGRITY_ERROR"); } }
async function verifyV2(raw: string, passphrase: string): Promise<void> { const opened = await decryptEnvelope(parseEnvelope(raw), passphrase); if (opened.version !== 2) throw new Error("VAULT_MIGRATION_VERIFICATION_FAILED"); }
async function migrateV1(raw: string, passphrase: string): Promise<EncryptedVaultFile[]> { const opened = await decryptEnvelope(parseEnvelope(raw), passphrase); if (opened.version !== 1) throw new Error("VAULT_RECORD_INVALID"); const upgraded = await encryptV2(opened.files, passphrase); const upgradedRaw = JSON.stringify(upgraded.envelope); const store = localStore(); store.setItem(MIGRATION_KEY, upgradedRaw); await verifyV2(store.getItem(MIGRATION_KEY) ?? "", passphrase); store.setItem(VAULT_STORAGE_KEY, upgradedRaw); store.removeItem(MIGRATION_KEY); store.removeItem(LEGACY_VAULT_STORAGE_KEY); activeKey = upgraded.key; activeSalt = upgraded.salt; activeVersion = 2; return opened.files; }
export function hasEncryptedVault(): boolean { try { const store = localStore(); return store.getItem(VAULT_STORAGE_KEY) !== null || store.getItem(LEGACY_VAULT_STORAGE_KEY) !== null; } catch { return false; } }
export async function unlockOrCreateEncryptedVault(passphrase: string, legacyFiles: EncryptedVaultFile[], allowCreate = true): Promise<EncryptedVaultFile[]> { if (!passphrase) throw new Error("PASSPHRASE_REQUIRED"); const store = localStore(); const v2Raw = store.getItem(VAULT_STORAGE_KEY); if (v2Raw !== null) { const opened = await decryptEnvelope(parseEnvelope(v2Raw), passphrase); activeKey = opened.key; activeSalt = opened.salt; activeVersion = 2; return opened.files; } const v1Raw = store.getItem(LEGACY_VAULT_STORAGE_KEY); if (v1Raw !== null) return migrateV1(v1Raw, passphrase); if (!allowCreate) throw new Error("VAULT_RECORD_MISSING"); const created = await encryptV2(legacyFiles, passphrase); const raw = JSON.stringify(created.envelope); store.setItem(VAULT_STORAGE_KEY, raw); await verifyV2(store.getItem(VAULT_STORAGE_KEY) ?? "", passphrase); activeKey = created.key; activeSalt = created.salt; activeVersion = 2; return legacyFiles; }
export async function persistEncryptedVault(files: EncryptedVaultFile[]): Promise<void> { if (!activeKey || !activeSalt || activeVersion !== 2) throw new Error("VAULT_LOCKED"); const iv = webCrypto().getRandomValues(new Uint8Array(AES_IV_BYTES)); const aad = v2Aad(activeSalt); const plain = new TextEncoder().encode(JSON.stringify(files)); const encrypted = await webCrypto().subtle.encrypt({ name: "AES-GCM", iv: asBufferSource(iv), additionalData: asBufferSource(aad), tagLength: 128 }, activeKey, asBufferSource(plain)); plain.fill(0); const envelope: VaultEnvelopeV2 = { version: 2, kdf: "PBKDF2-SHA256+DEVICE-SECRET", iterations: PBKDF2_ITERATIONS, salt: encodeBase64(activeSalt), iv: encodeBase64(iv), aad: encodeBase64(aad), ciphertext: encodeBase64(new Uint8Array(encrypted)) }; localStore().setItem(VAULT_STORAGE_KEY, JSON.stringify(envelope)); }
export function lockEncryptedVaultSession(): void { activeKey = null; activeSalt = null; activeVersion = 0; }

type EncryptedAttachmentMeta = { recordType: "meta"; id: string; mimeType: string; size: number; totalChunks: number; complete: boolean };
type EncryptedAttachmentChunk = { recordType: "chunk"; id: string; fileId: string; index: number; iv: string; ciphertext: Uint8Array };
type AttachmentRecord = EncryptedAttachmentMeta | EncryptedAttachmentChunk;
const ATTACHMENT_DB_NAME = "duress-security-vault-files";
const ATTACHMENT_STORE_NAME = "attachments";
const ATTACHMENT_CHUNK_SIZE = 1024 * 1024;

function openAttachmentDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") throw new Error("VAULT_ATTACHMENT_STORAGE_UNAVAILABLE");
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(ATTACHMENT_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ATTACHMENT_STORE_NAME)) db.createObjectStore(ATTACHMENT_STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("VAULT_ATTACHMENT_STORAGE_UNAVAILABLE"));
    request.onblocked = () => reject(new Error("VAULT_ATTACHMENT_STORAGE_BLOCKED"));
  });
}
function attachmentAad(id: string, index: number, totalChunks: number, mimeType: string, size: number): Uint8Array {
  return new TextEncoder().encode(`duress-vault-attachment-v1|${id}|${index}|${totalChunks}|${mimeType}|${size}`);
}
async function writeAttachmentRecord(record: AttachmentRecord): Promise<void> {
  const db = await openAttachmentDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(ATTACHMENT_STORE_NAME, "readwrite");
      transaction.objectStore(ATTACHMENT_STORE_NAME).put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("VAULT_ATTACHMENT_WRITE_FAILED"));
      transaction.onabort = () => reject(transaction.error ?? new Error("VAULT_ATTACHMENT_WRITE_FAILED"));
    });
  } finally { db.close(); }
}
async function readAttachmentRecord(id: string): Promise<AttachmentRecord | undefined> {
  const db = await openAttachmentDatabase();
  try {
    return await new Promise<AttachmentRecord | undefined>((resolve, reject) => {
      const transaction = db.transaction(ATTACHMENT_STORE_NAME, "readonly");
      const request = transaction.objectStore(ATTACHMENT_STORE_NAME).get(id);
      request.onsuccess = () => resolve(request.result as AttachmentRecord | undefined);
      request.onerror = () => reject(request.error ?? new Error("VAULT_ATTACHMENT_READ_FAILED"));
    });
  } finally { db.close(); }
}

/** Encrypt a file in 1 MiB chunks so large media does not require a full-size plaintext buffer. */
export async function persistEncryptedAttachment(id: string, file: Blob, mimeType: string): Promise<void> {
  if (!activeKey || activeVersion !== 2) throw new Error("VAULT_LOCKED");
  if (!id || id.length > 200 || !Number.isSafeInteger(file.size) || file.size < 1) throw new Error("VAULT_ATTACHMENT_INVALID");
  const key = activeKey;
  const safeMimeType = (mimeType || "application/octet-stream").slice(0, 200);
  const totalChunks = Math.ceil(file.size / ATTACHMENT_CHUNK_SIZE);
  const meta: EncryptedAttachmentMeta = { recordType: "meta", id, mimeType: safeMimeType, size: file.size, totalChunks, complete: false };
  await writeAttachmentRecord(meta);
  try {
    for (let index = 0; index < totalChunks; index += 1) {
      const plaintext = new Uint8Array(await file.slice(index * ATTACHMENT_CHUNK_SIZE, Math.min(file.size, (index + 1) * ATTACHMENT_CHUNK_SIZE)).arrayBuffer());
      const iv = webCrypto().getRandomValues(new Uint8Array(AES_IV_BYTES));
      let ciphertext: Uint8Array;
      try {
        ciphertext = new Uint8Array(await webCrypto().subtle.encrypt(
          { name: "AES-GCM", iv: asBufferSource(iv), additionalData: asBufferSource(attachmentAad(id, index, totalChunks, safeMimeType, file.size)), tagLength: 128 },
          key,
          asBufferSource(plaintext),
        ));
      } finally { plaintext.fill(0); }
      await writeAttachmentRecord({ recordType: "chunk", id: `${id}:${index}`, fileId: id, index, iv: encodeBase64(iv), ciphertext });
    }
    await writeAttachmentRecord({ ...meta, complete: true });
  } catch (error) {
    try { await deleteEncryptedAttachment(id); } catch { /* A later app-data wipe also removes incomplete records. */ }
    throw error;
  }
}

/** Decrypt only into a short-lived in-memory Blob for viewing or explicit download. */
export async function openEncryptedAttachment(id: string): Promise<{ blob: Blob; mimeType: string }> {
  if (!activeKey || activeVersion !== 2) throw new Error("VAULT_LOCKED");
  const key = activeKey;
  const meta = await readAttachmentRecord(id);
  if (!meta || meta.recordType !== "meta" || !meta.complete || meta.id !== id ||
      typeof meta.mimeType !== "string" || !Number.isSafeInteger(meta.size) || meta.size < 1 ||
      !Number.isSafeInteger(meta.totalChunks) || meta.totalChunks < 1) throw new Error("VAULT_ATTACHMENT_NOT_FOUND");
  const parts: BlobPart[] = [];
  let totalSize = 0;
  for (let index = 0; index < meta.totalChunks; index += 1) {
    const record = await readAttachmentRecord(`${id}:${index}`);
    if (!record || record.recordType !== "chunk" || record.fileId !== id || record.index !== index ||
        !(record.ciphertext instanceof Uint8Array) || typeof record.iv !== "string") throw new Error("VAULT_ATTACHMENT_INTEGRITY_ERROR");
    let clear: Uint8Array;
    try {
      clear = new Uint8Array(await webCrypto().subtle.decrypt(
        { name: "AES-GCM", iv: asBufferSource(decodeBase64(record.iv)), additionalData: asBufferSource(attachmentAad(id, index, meta.totalChunks, meta.mimeType, meta.size)), tagLength: 128 },
        key, asBufferSource(record.ciphertext),
      ));
    } catch { throw new Error("VAULT_ATTACHMENT_INTEGRITY_ERROR"); }
    const part = new Blob([clear.buffer as ArrayBuffer], { type: "application/octet-stream" });
    clear.fill(0);
    parts.push(part);
    totalSize += part.size;
  }
  if (totalSize !== meta.size) throw new Error("VAULT_ATTACHMENT_INTEGRITY_ERROR");
  return { blob: new Blob(parts, { type: meta.mimeType }), mimeType: meta.mimeType };
}
export async function deleteEncryptedAttachment(id: string): Promise<void> {
  let meta: EncryptedAttachmentMeta | undefined;
  try { const record = await readAttachmentRecord(id); if (record?.recordType === "meta") meta = record; } catch { /* Still remove metadata if readable. */ }
  if (meta) {
    for (let index = 0; index < meta.totalChunks; index += 1) {
      const db = await openAttachmentDatabase();
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction(ATTACHMENT_STORE_NAME, "readwrite");
          transaction.objectStore(ATTACHMENT_STORE_NAME).delete(`${id}:${index}`);
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error ?? new Error("VAULT_ATTACHMENT_DELETE_FAILED"));
          transaction.onabort = () => reject(transaction.error ?? new Error("VAULT_ATTACHMENT_DELETE_FAILED"));
        });
      } finally { db.close(); }
    }
  }
  const db = await openAttachmentDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(ATTACHMENT_STORE_NAME, "readwrite");
      transaction.objectStore(ATTACHMENT_STORE_NAME).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("VAULT_ATTACHMENT_DELETE_FAILED"));
      transaction.onabort = () => reject(transaction.error ?? new Error("VAULT_ATTACHMENT_DELETE_FAILED"));
    });
  } finally { db.close(); }
}

