/**
 * Persist adapter. Browser/PWA mode uses browser storage for demo data only.
 * A native Android build stores Zustand's serialized state and the extended-lock
 * record in an AES-GCM encrypted SharedPreferences entry whose key is held by
 * Android Keystore. Existing localStorage data is migrated once, then removed.
 * If the native secure store is unavailable, this deliberately fails closed and
 * never writes PINs/vault content to localStorage inside the APK.
 */
import * as nativeBridge from "@/lib/native-bridge";

export type AppStorageValue = string | null | Promise<string | null>;

function reportSecureStorageError(reason = "SECURE_STORAGE_UNAVAILABLE"): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent("duress-security-storage-error", { detail: { reason } }));
  } catch {
    // Event reporting must never crash persistence.
  }
}

function webGet(key: string): string | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}

function webSet(key: string, value: string): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  } catch {
    // Browser storage can be disabled by the user or browser policy.
  }
}

function webRemove(key: string): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(key);
  } catch {
    // Browser storage can be disabled by the user or browser policy.
  }
}

export const appStorage = {
  getItem(key: string): AppStorageValue {
    if (!nativeBridge.isNativeAndroid()) return webGet(key);
    return (async () => {
      const stored = await nativeBridge.secureStorageGet(key);
      if (!stored.available) {
        console.error(`[DuressSecurity] Secure storage unavailable; refusing plaintext fallback for ${key}.`);
        reportSecureStorageError(stored.reason ?? "SECURE_STORAGE_UNAVAILABLE");
        return null;
      }
      if (stored.found) return stored.value;

      // One-time migration from older APK builds. Clear the plaintext copy only
      // after Keystore-backed encryption has succeeded.
      const legacy = webGet(key);
      if (legacy !== null) {
        const migrated = await nativeBridge.secureStorageSet(key, legacy);
        if (!migrated) {
          console.error(`[DuressSecurity] Could not migrate ${key} to secure storage.`);
          reportSecureStorageError("LEGACY_MIGRATION_FAILED");
          return null;
        }
        webRemove(key);
        return legacy;
      }
      return null;
    })();
  },
  setItem(key: string, value: string): void | Promise<void> {
    if (!nativeBridge.isNativeAndroid()) {
      webSet(key, value);
      return;
    }
    return (async () => {
      const saved = await nativeBridge.secureStorageSet(key, value);
      if (!saved) {
        console.error(`[DuressSecurity] Secure storage write failed for ${key}; no plaintext fallback was used.`);
        reportSecureStorageError("SECURE_STORAGE_WRITE_FAILED");
        return;
      }
      webRemove(key);
    })();
  },
  removeItem(key: string): void | Promise<void> {
    if (!nativeBridge.isNativeAndroid()) {
      webRemove(key);
      return;
    }
    return (async () => {
      const removed = await nativeBridge.secureStorageRemove(key);
      if (!removed) reportSecureStorageError("SECURE_STORAGE_REMOVE_FAILED");
      webRemove(key);
    })();
  },
};

export async function getStoredValue(key: string): Promise<string | null> {
  const value = appStorage.getItem(key);
  return value instanceof Promise ? value : value;
}

export async function setStoredValue(key: string, value: string): Promise<boolean> {
  if (!nativeBridge.isNativeAndroid()) {
    webSet(key, value);
    return true;
  }
  const saved = await nativeBridge.secureStorageSet(key, value);
  if (saved) webRemove(key);
  return saved;
}

export async function removeStoredValue(key: string): Promise<void> {
  const value = appStorage.removeItem(key);
  if (value instanceof Promise) await value;
}
