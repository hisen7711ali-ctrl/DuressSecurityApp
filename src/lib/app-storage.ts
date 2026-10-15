import * as nativeBridge from "@/lib/native-bridge";

export type AppStorageValue = string | null | Promise<string | null>;
const STARTUP_RETRY_DELAY_MS = 3000;
const STARTUP_MAX_ATTEMPTS = 40;
const RETRYABLE_REASONS = new Set(["NATIVE_TIMEOUT", "NATIVE_PLUGIN_UNAVAILABLE", "NATIVE_CALL_FAILED"]);
const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
function reportSecureStorageError(reason = "SECURE_STORAGE_UNAVAILABLE"): void { if (typeof window === "undefined") return; try { window.dispatchEvent(new CustomEvent("duress-security-storage-error", { detail: { reason } })); } catch { } }
function webGet(key: string): string | null { try { return typeof localStorage === "undefined" ? null : localStorage.getItem(key); } catch { return null; } }
function webSet(key: string, value: string): void { try { if (typeof localStorage !== "undefined") localStorage.setItem(key, value); } catch { } }
function webRemove(key: string): void { try { if (typeof localStorage !== "undefined") localStorage.removeItem(key); } catch { } }

async function secureGetWithRetry(key: string): Promise<string | null> {
  for (let attempt = 1; attempt <= STARTUP_MAX_ATTEMPTS; attempt += 1) {
    const stored = await nativeBridge.secureStorageGet(key);
    if (stored.available) {
      if (stored.found) return stored.value;
      const legacy = webGet(key);
      if (legacy !== null) {
        const migrated = await nativeBridge.secureStorageSet(key, legacy);
        if (!migrated) { reportSecureStorageError("LEGACY_MIGRATION_FAILED"); return null; }
        webRemove(key); return legacy;
      }
      return null;
    }
    const reason = stored.reason ?? "SECURE_STORAGE_UNAVAILABLE";
    if (!RETRYABLE_REASONS.has(reason)) { reportSecureStorageError(reason); return null; }
    if (attempt < STARTUP_MAX_ATTEMPTS) await sleep(STARTUP_RETRY_DELAY_MS);
  }
  reportSecureStorageError("STARTUP_SECURE_STORAGE_RETRY_EXHAUSTED");
  return null;
}

export const appStorage = {
  getItem(key: string): AppStorageValue {
    if (!nativeBridge.isNativeAndroid()) return webGet(key);
    return secureGetWithRetry(key);
  },
  setItem(key: string, value: string): void | Promise<void> {
    if (!nativeBridge.isNativeAndroid()) { webSet(key, value); return; }
    return (async () => { const saved = await nativeBridge.secureStorageSet(key, value); if (!saved) { reportSecureStorageError("SECURE_STORAGE_WRITE_FAILED"); return; } webRemove(key); })();
  },
  removeItem(key: string): void | Promise<void> {
    if (!nativeBridge.isNativeAndroid()) { webRemove(key); return; }
    return (async () => { const removed = await nativeBridge.secureStorageRemove(key); if (!removed) reportSecureStorageError("SECURE_STORAGE_REMOVE_FAILED"); else webRemove(key); })();
  },
};
export async function getStoredValue(key: string): Promise<string | null> { const value = appStorage.getItem(key); return value instanceof Promise ? value : value; }
export async function setStoredValue(key: string, value: string): Promise<boolean> { if (!nativeBridge.isNativeAndroid()) { webSet(key, value); return true; } const saved = await nativeBridge.secureStorageSet(key, value); if (saved) webRemove(key); return saved; }
export async function removeStoredValue(key: string): Promise<void> { const value = appStorage.removeItem(key); if (value instanceof Promise) await value; }
