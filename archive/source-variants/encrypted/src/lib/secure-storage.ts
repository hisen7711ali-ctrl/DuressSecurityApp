/**
 * secure-storage — encrypted storage adapter for zustand's `persist`.
 *
 * Native Android build (Capacitor):
 *   Every read/write is routed through the `SecureVault` native plugin
 *   (see android-native/plugin/.../vault/SecureVaultPlugin.kt), which keeps
 *   the serialized app state inside
 *   androidx.security.crypto.EncryptedSharedPreferences. That layer is
 *   itself protected by an AES-256-GCM key that lives inside the Android
 *   Keystore (hardware-backed on devices that support it) and never leaves
 *   it. Plaintext JSON — PINs included — never touches `localStorage` on a
 *   native build.
 *
 * Browser / `npm run dev` preview (no native plugin, e.g. this sandbox):
 *   There is no OS-level keystore inside a web page, so this path falls
 *   back to AES-GCM with a locally generated key kept in IndexedDB. This is
 *   strictly better than the old plain-JSON-in-localStorage behaviour, but
 *   it is NOT a real secrets store: any script that can run on this origin
 *   can read the key out of IndexedDB. Treat the browser preview as a demo
 *   only — the hardware-backed guarantee only exists in the native Android
 *   APK. This file never pretends otherwise.
 */
import type { StateStorage } from "zustand/middleware";
import * as nativeBridge from "@/lib/native-bridge";

const FALLBACK_DB = "duress-security-keystore";
const FALLBACK_STORE = "keys";
const FALLBACK_KEY_ID = "fallback-aes-key";

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(FALLBACK_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(FALLBACK_STORE)) {
        req.result.createObjectStore(FALLBACK_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGetKeyBytes(): Promise<Uint8Array | null> {
  try {
    const db = await idbOpen();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(FALLBACK_STORE, "readonly");
      const req = tx.objectStore(FALLBACK_STORE).get(FALLBACK_KEY_ID);
      req.onsuccess = () => resolve((req.result as Uint8Array) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function idbSetKeyBytes(raw: Uint8Array): Promise<void> {
  try {
    const db = await idbOpen();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(FALLBACK_STORE, "readwrite");
      tx.objectStore(FALLBACK_STORE).put(raw, FALLBACK_KEY_ID);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* IndexedDB unavailable: the fallback key cannot persist across reloads,
       so persisted state falls back to defaults next launch — still never
       plaintext on disk while it does exist. */
  }
}

let fallbackKeyPromise: Promise<CryptoKey> | null = null;
async function getFallbackKey(): Promise<CryptoKey> {
  fallbackKeyPromise ??= (async () => {
    const existing = await idbGetKeyBytes();
    if (existing) {
      return crypto.subtle.importKey("raw", existing as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);
    }
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    const raw = new Uint8Array(await crypto.subtle.exportKey("raw", key));
    await idbSetKeyBytes(raw);
    return key;
  })();
  return fallbackKeyPromise;
}

async function fallbackEncrypt(plain: string): Promise<string> {
  const key = await getFallbackKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain));
  const combined = new Uint8Array(iv.length + cipher.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipher), iv.length);
  let binary = "";
  combined.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

async function fallbackDecrypt(packed: string): Promise<string | null> {
  try {
    const key = await getFallbackKey();
    const binary = atob(packed);
    const combined = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) combined[i] = binary.charCodeAt(i);
    const iv = combined.slice(0, 12);
    const cipher = combined.slice(12);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

const FALLBACK_PREFIX = "enc:";

export const secureStorage: StateStorage = {
  async getItem(name) {
    if (nativeBridge.isNativeAndroid()) {
      return nativeBridge.secureGet(name);
    }
    try {
      const packed = localStorage.getItem(FALLBACK_PREFIX + name);
      if (!packed) return null;
      return await fallbackDecrypt(packed);
    } catch {
      return null;
    }
  },
  async setItem(name, value) {
    if (nativeBridge.isNativeAndroid()) {
      await nativeBridge.secureSet(name, value);
      return;
    }
    try {
      localStorage.setItem(FALLBACK_PREFIX + name, await fallbackEncrypt(value));
    } catch {
      /* storage unavailable */
    }
  },
  async removeItem(name) {
    if (nativeBridge.isNativeAndroid()) {
      await nativeBridge.secureRemove(name);
      return;
    }
    try {
      localStorage.removeItem(FALLBACK_PREFIX + name);
    } catch {
      /* ignore */
    }
  },
};

/** Used by the emergency-wipe flow to remove the encrypted blob through whichever backend is active. */
export async function clearSecureStore(name = "duress-security-app"): Promise<void> {
  await secureStorage.removeItem(name);
}
