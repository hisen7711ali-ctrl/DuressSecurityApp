import * as nativeBridge from "@/lib/native-bridge";

export type AppStorageValue = string | null | Promise<string | null>;

function reportSecureStorageError(reason = "SECURE_STORAGE_UNAVAILABLE"): void {
  if (typeof window === "undefined") return;
  try { window.dispatchEvent(new CustomEvent("duress-security-storage-error", { detail: { reason } })); } catch { /* ignore */ }
}

function webGet(key: string): string | null { try { return typeof localStorage === "undefined" ? null : localStorage.getItem(key); } catch { return null; } }
function webSet(key: string, value: string): void { try { if (typeof localStorage !== "undefined") localStorage.setItem(key, value); } catch { /* ignore */ } }
function webRemove(key: string): void { try { if (typeof localStorage !== "undefined") localStorage.removeItem(key); } catch { /* ignore */ } }

async function secureGetOnce(key: string): Promise<string | null> {
  const stored = await nativeBridge.secureStorageGet(key);
  if (stored.available) {
    if (stored.found) return stored.value;
    const legacy = webGet(key);
    if (legacy !== null) {
      const migrated = await nativeBridge.secureStorageSet(key, legacy);
      if (!migrated) {
        reportSecureStorageError("LEGACY_MIGRATION_FAILED");
        throw new Error("LEGACY_MIGRATION_FAILED");
      }
      webRemove(key);
      return legacy;
    }
    return null;
  }
  const reason = stored.reason ?? "SECURE_STORAGE_UNAVAILABLE";
  reportSecureStorageError(reason);
  // Never turn a failed secure read into a missing record. Callers must distinguish
  // "no record yet" from "the encrypted record could not be read" and fail closed.
  throw new Error(reason);
}

export const appStorage = {
  getItem(key: string): AppStorageValue {
    if (!nativeBridge.isNativeAndroid()) return webGet(key);
    return secureGetOnce(key);
  },
  setItem(key: string, value: string): void | Promise<void> {
    if (!nativeBridge.isNativeAndroid()) { webSet(key, value); return; }
    return (async () => {
      const saved = await nativeBridge.secureStorageSet(key, value);
      if (!saved) { reportSecureStorageError("SECURE_STORAGE_WRITE_FAILED"); return; }
      webRemove(key);
    })();
  },
  removeItem(key: string): void | Promise<void> {
    if (!nativeBridge.isNativeAndroid()) { webRemove(key); return; }
    return (async () => {
      const removed = await nativeBridge.secureStorageRemove(key);
      if (!removed) reportSecureStorageError("SECURE_STORAGE_REMOVE_FAILED");
      else webRemove(key);
    })();
  },
};

export async function getStoredValue(key: string): Promise<string | null> {
  const value = appStorage.getItem(key);
  return value instanceof Promise ? value : value;
}

export async function setStoredValue(key: string, value: string): Promise<boolean> {
  if (!nativeBridge.isNativeAndroid()) { webSet(key, value); return true; }
  const saved = await nativeBridge.secureStorageSet(key, value);
  if (saved) webRemove(key);
  return saved;
}

export async function removeStoredValue(key: string): Promise<void> {
  const value = appStorage.removeItem(key);
  if (value instanceof Promise) await value;
}
