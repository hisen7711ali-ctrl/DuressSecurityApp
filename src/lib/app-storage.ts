import * as nativeBridge from "@/lib/native-bridge";

export type AppStorageValue = string | null | Promise<string | null>;

const STARTUP_RETRY_DELAY_MS = 3000;
const STARTUP_MAX_ATTEMPTS = 12;
const RETRYABLE_REASONS = new Set(["NATIVE_TIMEOUT", "NATIVE_PLUGIN_UNAVAILABLE", "NATIVE_CALL_FAILED", "KEYSTORE_ERROR"]);

let secureStorageWarmup: Promise<boolean> | null = null;

function reportSecureStorageError(reason = "SECURE_STORAGE_UNAVAILABLE"): void { if (typeof window === "undefined") return; try { window.dispatchEvent(new CustomEvent("duress-security-storage-error", { detail: { reason } })); } catch { /* ignore */ } }
function webGet(key: string): string | null { try { return typeof localStorage === "undefined" ? null : localStorage.getItem(key); } catch { return null; } }
function webSet(key: string, value: string): void { try { if (typeof localStorage !== "undefined") localStorage.setItem(key, value); } catch { /* ignore */ } }
function webRemove(key: string): void { try { if (typeof localStorage !== "undefined") localStorage.removeItem(key); } catch { /* ignore */ } }

async function warmSecureStorage(): Promise<boolean> {
  if (!nativeBridge.isNativeAndroid()) return true;
  secureStorageWarmup ??= nativeBridge.initializeSecureStorage().catch(() => false);
  const ok = await secureStorageWarmup;
  if (!ok) secureStorageWarmup = null;
  return ok;
}

async function secureGetWithRetry(key: string): Promise<string | null> {
  let lastReason = "SECURE_STORAGE_UNAVAILABLE";
  // Never turn a failed secure read into a missing record: a missing record is valid only when the native store explicitly reports found=false with available=true.
  for (let attempt = 1; attempt <= STARTUP_MAX_ATTEMPTS; attempt += 1) {
    const stored = await nativeBridge.secureStorageGet(key);
    if (stored.available) {
      if (stored.found) return stored.value;
      const legacy = webGet(key);
      if (legacy !== null) {
        const migrated = await nativeBridge.secureStorageSet(key, legacy);
        if (!migrated) { reportSecureStorageError("LEGACY_MIGRATION_FAILED"); throw new Error("LEGACY_MIGRATION_FAILED"); }
        webRemove(key); return legacy;
      }
      return null;
    }
    lastReason = stored.reason ?? "SECURE_STORAGE_UNAVAILABLE";
    if (!RETRYABLE_REASONS.has(lastReason)) { reportSecureStorageError(lastReason); throw new Error(lastReason); }
    if (attempt === 1 || lastReason === "KEYSTORE_ERROR") await warmSecureStorage();
    if (attempt < STARTUP_MAX_ATTEMPTS) await new Promise<void>((resolve) => window.setTimeout(resolve, STARTUP_RETRY_DELAY_MS));
  }
  reportSecureStorageError("STARTUP_SECURE_STORAGE_RETRY_EXHAUSTED");
  throw new Error("STARTUP_SECURE_STORAGE_RETRY_EXHAUSTED");
}

export const appStorage = {
  getItem(key: string): AppStorageValue { if (!nativeBridge.isNativeAndroid()) return webGet(key); return secureGetWithRetry(key); },
  setItem(key: string, value: string): void | Promise<void> {
    if (!nativeBridge.isNativeAndroid()) { webSet(key, value); return; }
    return (async () => { const saved = await nativeBridge.secureStorageSet(key, value); if (!saved) reportSecureStorageError("SECURE_STORAGE_WRITE_FAILED"); else webRemove(key); })();
  },
  removeItem(key: string): void | Promise<void> {
    if (!nativeBridge.isNativeAndroid()) { webRemove(key); return; }
    return (async () => { const removed = await nativeBridge.secureStorageRemove(key); if (!removed) reportSecureStorageError("SECURE_STORAGE_REMOVE_FAILED"); else webRemove(key); })();
  },
};

export async function getStoredValue(key: string): Promise<string | null> { const value = appStorage.getItem(key); return value instanceof Promise ? value : value; }
export async function setStoredValue(key: string, value: string): Promise<boolean> { if (!nativeBridge.isNativeAndroid()) { webSet(key, value); return true; } const saved = await nativeBridge.secureStorageSet(key, value); if (saved) webRemove(key); return saved; }
export async function removeStoredValue(key: string): Promise<void> { const value = appStorage.removeItem(key); if (value instanceof Promise) await value; }
