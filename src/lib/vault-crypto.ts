/**
 * Passphrase-encrypted vault storage for browsers/PWA and the Capacitor WebView.
 * The vault is encrypted with AES-256-GCM; its key is derived with PBKDF2-SHA-256
 * from a user-chosen passphrase and a random salt. No plaintext fallback exists.
 * Android builds additionally keep the main app state in Android Keystore-backed
 * AES-GCM storage. Browser security still depends on a trusted origin and a strong
 * passphrase; data is exposed while the vault is unlocked in the running app.
 */
export type EncryptedVaultFile = {
  id: string;
  title: string;
  body: string;
  updatedAt: string;
};

type VaultEnvelope = {
  version: 1;
  kdf: "PBKDF2-SHA256";
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
};

export const VAULT_STORAGE_KEY = "duress-security-vault-v1";
export const VAULT_MIN_PASSPHRASE_LENGTH = 12;
const PBKDF2_ITERATIONS = 310_000;
const AES_KEY_BITS = 256;
const AES_IV_BYTES = 12;
const SALT_BYTES = 16;

let activeKey: CryptoKey | null = null;
let activeSalt: Uint8Array | null = null;

function webCrypto(): Crypto {
  if (!globalThis.crypto?.subtle || !globalThis.crypto.getRandomValues) {
    throw new Error("WEBCRYPTO_UNAVAILABLE");
  }
  return globalThis.crypto;
}

function localStore(): Storage {
  if (typeof globalThis.localStorage === "undefined") throw new Error("SECURE_STORAGE_UNAVAILABLE");
  return globalThis.localStorage;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function asBufferSource(bytes: Uint8Array): BufferSource {
  return bytes as unknown as BufferSource;
}

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const cryptoApi = webCrypto();
  const material = await cryptoApi.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return cryptoApi.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: asBufferSource(salt), iterations },
    material,
    { name: "AES-GCM", length: AES_KEY_BITS },
    false,
    ["encrypt", "decrypt"],
  );
}

function validateFiles(value: unknown): value is EncryptedVaultFile[] {
  return Array.isArray(value) && value.every((row) =>
    row && typeof row === "object" && typeof row.id === "string" &&
    typeof row.title === "string" && typeof row.body === "string" && typeof row.updatedAt === "string",
  );
}

function parseEnvelope(raw: string): VaultEnvelope {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object") throw new Error("VAULT_RECORD_INVALID");
  const envelope = value as Partial<VaultEnvelope>;
  if (envelope.version !== 1 || envelope.kdf !== "PBKDF2-SHA256" ||
      !Number.isInteger(envelope.iterations) || (envelope.iterations ?? 0) < 100_000 ||
      typeof envelope.salt !== "string" || typeof envelope.iv !== "string" || typeof envelope.ciphertext !== "string") {
    throw new Error("VAULT_RECORD_INVALID");
  }
  return envelope as VaultEnvelope;
}

async function encryptEnvelope(files: EncryptedVaultFile[], key: CryptoKey, salt: Uint8Array): Promise<void> {
  const cryptoApi = webCrypto();
  const iv = cryptoApi.getRandomValues(new Uint8Array(AES_IV_BYTES));
  const plain = new TextEncoder().encode(JSON.stringify(files));
  const encrypted = await cryptoApi.subtle.encrypt({ name: "AES-GCM", iv: asBufferSource(iv), tagLength: 128 }, key, asBufferSource(plain));
  const envelope: VaultEnvelope = {
    version: 1,
    kdf: "PBKDF2-SHA256",
    iterations: PBKDF2_ITERATIONS,
    salt: encodeBase64(salt),
    iv: encodeBase64(iv),
    ciphertext: encodeBase64(new Uint8Array(encrypted)),
  };
  localStore().setItem(VAULT_STORAGE_KEY, JSON.stringify(envelope));
}

/** True when an encrypted vault envelope exists. Does not imply it can be decrypted. */
export function hasEncryptedVault(): boolean {
  try { return localStore().getItem(VAULT_STORAGE_KEY) !== null; }
  catch { return false; }
}

/**
 * Open an existing vault, or create one while securely migrating any legacy
 * in-memory files. New passphrases must be at least 12 characters. Existing
 * passphrases are never silently replaced if authentication fails.
 */
export async function unlockOrCreateEncryptedVault(
  passphrase: string,
  legacyFiles: EncryptedVaultFile[],
  allowCreate = true,
): Promise<EncryptedVaultFile[]> {
  if (!passphrase) throw new Error("PASSPHRASE_REQUIRED");
  const store = localStore();
  const raw = store.getItem(VAULT_STORAGE_KEY);
  if (raw !== null) {
    const envelope = parseEnvelope(raw);
    const salt = decodeBase64(envelope.salt);
    const iv = decodeBase64(envelope.iv);
    const ciphertext = decodeBase64(envelope.ciphertext);
    if (salt.length !== SALT_BYTES || iv.length !== AES_IV_BYTES || ciphertext.length < 16) {
      throw new Error("VAULT_RECORD_INVALID");
    }
    const key = await deriveKey(passphrase, salt, envelope.iterations);
    let clear: ArrayBuffer;
    try {
      clear = await webCrypto().subtle.decrypt(
        { name: "AES-GCM", iv: asBufferSource(iv), tagLength: 128 },
        key,
        asBufferSource(ciphertext),
      );
    } catch {
      throw new Error("VAULT_PASSPHRASE_OR_INTEGRITY_ERROR");
    }
    let parsed: unknown;
    try { parsed = JSON.parse(new TextDecoder().decode(clear)); }
    catch { throw new Error("VAULT_RECORD_INVALID"); }
    if (!validateFiles(parsed)) throw new Error("VAULT_RECORD_INVALID");
    activeKey = key;
    activeSalt = salt;
    return parsed;
  }

  if (!allowCreate) throw new Error("VAULT_RECORD_MISSING");
  if (passphrase.length < VAULT_MIN_PASSPHRASE_LENGTH) throw new Error("PASSPHRASE_TOO_SHORT");
  const salt = webCrypto().getRandomValues(new Uint8Array(SALT_BYTES));
  const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS);
  // Store ciphertext first; caller marks the state migrated only after this succeeds.
  await encryptEnvelope(legacyFiles, key, salt);
  activeKey = key;
  activeSalt = salt;
  return legacyFiles;
}

/** Persist changes only while an unlocked vault key is held in memory. */
export async function persistEncryptedVault(files: EncryptedVaultFile[]): Promise<void> {
  if (!activeKey || !activeSalt) throw new Error("VAULT_LOCKED");
  await encryptEnvelope(files, activeKey, activeSalt);
}

/** Drop the in-memory cryptographic capability when the user leaves the vault. */
export function lockEncryptedVaultSession(): void {
  activeKey = null;
  activeSalt = null;
}
