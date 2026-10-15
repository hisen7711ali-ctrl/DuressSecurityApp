import { registerPlugin } from "@capacitor/core";

export type NativePermissionKey = "overlayPermission" | "usagePermission" | "accessibilityPermission" | "notificationPermission" | "autostartPermission";
export type NativePermissionStatus = { overlayPermission: boolean; usagePermission: boolean; accessibilityPermission: boolean; notificationPermission: boolean; autostartPermission: boolean; deviceAdmin: boolean; deviceOwner: boolean; biometricAvailable: boolean; preventUninstall: boolean; dedicatedDeviceMode: boolean };
type NativeResult = { ok: boolean };
export type SecureStorageReason = "NATIVE_PLUGIN_UNAVAILABLE" | "NATIVE_TIMEOUT" | "NATIVE_CALL_FAILED" | "KEY_MISSING" | "DECRYPTION_FAILED" | "KEYSTORE_ERROR" | "READ_FAILED" | "DEVICE_SECRET_INVALID";
type SecureRead = { available: boolean; found: boolean; value: string | null; reason?: SecureStorageReason | null };
type SecurityAdminNative = {
  isDeviceAdminActive(): Promise<{ active: boolean }>; requestDeviceAdmin(): Promise<{ granted: boolean }>; lockNow(): Promise<{ ok: boolean }>;
  isBiometricAvailable(): Promise<{ available: boolean }>; authenticateBiometric(options: { reason: string }): Promise<{ success: boolean }>;
  getPermissionStatus(): Promise<NativePermissionStatus>; listLaunchableApps(): Promise<{ apps: Array<{ packageName: string; label: string }> }>;
  requestSystemPermission(options: { permission: NativePermissionKey }): Promise<{ opened: boolean; supported: boolean }>;
  initializeSecureStorage(): Promise<NativeResult>; secureGet(options: { key: string }): Promise<SecureRead>; secureSet(options: { key: string; value: string }): Promise<NativeResult>; secureRemove(options: { key: string }): Promise<NativeResult>; secureClearOwned(): Promise<NativeResult>;
  setSelfUninstallBlocked(options: { blocked: boolean }): Promise<NativeResult>; setKioskMode(options: { enabled: boolean }): Promise<NativeResult>; setScreenCaptureAllowed(options: { allowed: boolean }): Promise<NativeResult>;
};
type CapacitorWindow = Window & { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } };
const NATIVE_CALL_TIMEOUT_MS = 2500;
// Keystore operations are performed on a native worker. Give OEM implementations enough
// time for first-use key generation without making a normal UI call unbounded.
const NATIVE_STORAGE_TIMEOUT_MS = 5000;
const NATIVE_INITIALIZE_TIMEOUT_MS = 10000;
function withNativeTimeout<T>(promise: Promise<T>, fallback: T, timeoutMs = NATIVE_CALL_TIMEOUT_MS): Promise<T> { return new Promise((resolve) => { let settled = false; const finish = (value: T) => { if (settled) return; settled = true; resolve(value); }; const timer = window.setTimeout(() => finish(fallback), timeoutMs); promise.then((value) => { window.clearTimeout(timer); finish(value); }).catch(() => { window.clearTimeout(timer); finish(fallback); }); }); }
function isNativeRuntime(): boolean { if (typeof window === "undefined") return false; return Boolean((window as CapacitorWindow).Capacitor?.isNativePlatform?.()); }
let pluginPromise: Promise<SecurityAdminNative | null> | null = null;
async function getNativePlugin(): Promise<SecurityAdminNative | null> { if (!isNativeRuntime()) return null; pluginPromise ??= Promise.resolve(registerPlugin<SecurityAdminNative>("SecurityAdmin")); return pluginPromise; }
export function isNativeAndroid(): boolean { return isNativeRuntime() && (window as CapacitorWindow).Capacitor?.getPlatform?.() === "android"; }
export async function setScreenCaptureAllowed(allowed: boolean): Promise<boolean> { const plugin = await getNativePlugin(); if (!plugin) return false; try { return (await withNativeTimeout(plugin.setScreenCaptureAllowed({ allowed }), { ok: false })).ok; } catch { return false; } }
export async function isDeviceAdminActive(): Promise<boolean> { const plugin = await getNativePlugin(); if (!plugin) return false; try { return (await withNativeTimeout(plugin.isDeviceAdminActive(), { active: false })).active; } catch { return false; } }
export async function requestDeviceAdmin(): Promise<boolean> { const plugin = await getNativePlugin(); if (!plugin) return false; try { return (await withNativeTimeout(plugin.requestDeviceAdmin(), { granted: false })).granted; } catch { return false; } }
export async function lockNow(): Promise<boolean> { const plugin = await getNativePlugin(); if (!plugin) return false; try { return (await withNativeTimeout(plugin.lockNow(), { ok: false })).ok; } catch { return false; } }
export const nativeLockNow = lockNow;
export async function isBiometricAvailable(): Promise<boolean> { const plugin = await getNativePlugin(); if (!plugin) return false; try { return (await withNativeTimeout(plugin.isBiometricAvailable(), { available: false })).available; } catch { return false; } }
export async function authenticateBiometric(reason: string): Promise<boolean> { const plugin = await getNativePlugin(); if (!plugin) return false; try { return (await withNativeTimeout(plugin.authenticateBiometric({ reason }), { success: false })).success; } catch { return false; } }
export async function getPermissionStatus(): Promise<NativePermissionStatus | null> { const plugin = await getNativePlugin(); if (!plugin) return null; try { return await withNativeTimeout(plugin.getPermissionStatus(), null); } catch { return null; } }
export async function requestSystemPermission(permission: NativePermissionKey): Promise<{ opened: boolean; supported: boolean }> { const plugin = await getNativePlugin(); if (!plugin) return { opened: false, supported: false }; try { return await withNativeTimeout(plugin.requestSystemPermission({ permission }), { opened: false, supported: false }); } catch { return { opened: false, supported: false }; } }
export async function listLaunchableApps(): Promise<Array<{ packageName: string; label: string }> | null> { const plugin = await getNativePlugin(); if (!plugin) return null; try { return (await withNativeTimeout(plugin.listLaunchableApps(), { apps: [] })).apps.filter((app) => !!(app.packageName && app.label)); } catch { return null; } }

export async function initializeSecureStorage(): Promise<boolean> {
  const plugin = await getNativePlugin();
  if (!plugin) return false;
  try { return (await withNativeTimeout(plugin.initializeSecureStorage(), { ok: false }, NATIVE_INITIALIZE_TIMEOUT_MS)).ok; } catch { return false; }
}

export async function secureStorageGet(key: string): Promise<SecureRead> {
  const unavailable = (reason: SecureStorageReason): SecureRead => ({ available: false, found: false, value: null, reason });
  const plugin = await getNativePlugin();
  if (!plugin) return unavailable("NATIVE_PLUGIN_UNAVAILABLE");
  try {
    const result = await new Promise<SecureRead>((resolve) => {
      let settled = false;
      const finish = (value: SecureRead) => { if (settled) return; settled = true; window.clearTimeout(timer); resolve(value); };
      const timer = window.setTimeout(() => finish(unavailable("NATIVE_TIMEOUT")), NATIVE_STORAGE_TIMEOUT_MS);
      plugin.secureGet({ key }).then(finish).catch(() => finish(unavailable("NATIVE_CALL_FAILED")));
    });
    return result;
  } catch { return unavailable("NATIVE_CALL_FAILED"); }
}
export async function secureStorageSet(key: string, value: string): Promise<boolean> { const plugin = await getNativePlugin(); if (!plugin) return false; try { return (await withNativeTimeout(plugin.secureSet({ key, value }), { ok: false }, NATIVE_STORAGE_TIMEOUT_MS)).ok; } catch { return false; } }
export async function secureStorageRemove(key: string): Promise<boolean> { const plugin = await getNativePlugin(); if (!plugin) return false; try { return (await withNativeTimeout(plugin.secureRemove({ key }), { ok: false }, NATIVE_STORAGE_TIMEOUT_MS)).ok; } catch { return false; } }
export async function secureStorageClearOwned(): Promise<boolean> { const plugin = await getNativePlugin(); if (!plugin) return false; try { return (await withNativeTimeout(plugin.secureClearOwned(), { ok: false }, NATIVE_STORAGE_TIMEOUT_MS)).ok; } catch { return false; } }
export async function setSelfUninstallBlocked(blocked: boolean): Promise<boolean> { const plugin = await getNativePlugin(); if (!plugin) return false; try { return (await withNativeTimeout(plugin.setSelfUninstallBlocked({ blocked }), { ok: false })).ok; } catch { return false; } }
export async function setKioskMode(enabled: boolean): Promise<boolean> { const plugin = await getNativePlugin(); if (!plugin) return false; try { return (await withNativeTimeout(plugin.setKioskMode({ enabled }), { ok: false })).ok; } catch { return false; } }
