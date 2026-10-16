import * as nativeBridge from "@/lib/native-bridge";
import { decodeBase64, encodeBase64 } from "@/lib/vault-crypto";

/** Device-bound 256-bit vault secret. It is stored only in Android Keystore-backed storage. */
export const VAULT_PEPPER_KEY = "duress-vault-pepper-v1";
const PEPPER_BYTES = 32;

let cached: Uint8Array | null = null;
let inflight: Promise<Uint8Array | null> | null = null;

async function load(): Promise<Uint8Array | null> {
  if (!nativeBridge.isNativeAndroid()) return null;
  if (cached) return cached;

  const read = await nativeBridge.secureStorageGet(VAULT_PEPPER_KEY);
  if (!read.available) throw new Error("VAULT_DEVICE_KEY_UNAVAILABLE");

  if (read.found) {
    if (!read.value) throw new Error("VAULT_DEVICE_KEY_UNAVAILABLE");
    let bytes: Uint8Array;
    try { bytes = decodeBase64(read.value); } catch { throw new Error("VAULT_DEVICE_KEY_UNAVAILABLE"); }
    if (bytes.length !== PEPPER_BYTES) throw new Error("VAULT_DEVICE_KEY_UNAVAILABLE");
    cached = bytes;
    return bytes;
  }

  // Only a confirmed `found=false` permits creation. A timeout/error can never
  // manufacture a replacement secret and orphan an existing encrypted vault.
  const fresh = globalThis.crypto.getRandomValues(new Uint8Array(PEPPER_BYTES));
  if (!(await nativeBridge.secureStorageSet(VAULT_PEPPER_KEY, encodeBase64(fresh)))) {
    throw new Error("VAULT_DEVICE_KEY_UNAVAILABLE");
  }

  // Read-back verification prevents a race or storage failure from leaving the
  // process with a secret that was not actually persisted.
  const verify = await nativeBridge.secureStorageGet(VAULT_PEPPER_KEY);
  if (!verify.available || !verify.found || !verify.value) throw new Error("VAULT_DEVICE_KEY_UNAVAILABLE");
  let stored: Uint8Array;
  try { stored = decodeBase64(verify.value); } catch { throw new Error("VAULT_DEVICE_KEY_UNAVAILABLE"); }
  if (stored.length !== PEPPER_BYTES || encodeBase64(stored) !== encodeBase64(fresh)) {
    throw new Error("VAULT_DEVICE_KEY_UNAVAILABLE");
  }
  cached = stored;
  return stored;
}

export function getDevicePepper(): Promise<Uint8Array | null> {
  inflight ??= load().finally(() => { inflight = null; });
  return inflight;
}

export function forgetDevicePepperCache(): void { cached = null; }
