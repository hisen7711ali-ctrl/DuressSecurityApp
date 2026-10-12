import { registerPlugin } from "@capacitor/core";

export type NativePermissionKey =
  | "overlayPermission"
  | "usagePermission"
  | "accessibilityPermission"
  | "notificationPermission"
  | "autostartPermission";

export type NativePermissionStatus = {
  overlayPermission: boolean;
  usagePermission: boolean;
  accessibilityPermission: boolean;
  notificationPermission: boolean;
  autostartPermission: boolean;
  deviceAdmin: boolean;
  deviceOwner: boolean;
  biometricAvailable: boolean;
  preventUninstall: boolean;
  dedicatedDeviceMode: boolean;
};

type NativeResult = { ok: boolean };
type SecureRead = { available: boolean; found: boolean; value: string | null };

type SecurityAdminNative = {
  isDeviceAdminActive(): Promise<{ active: boolean }>;
  requestDeviceAdmin(): Promise<{ granted: boolean }>;
  lockNow(): Promise<{ ok: boolean }>;
  isBiometricAvailable(): Promise<{ available: boolean }>;
  authenticateBiometric(options: { reason: string }): Promise<{ success: boolean }>;
  getPermissionStatus(): Promise<NativePermissionStatus>;
  listLaunchableApps(): Promise<{ apps: Array<{ packageName: string; label: string }> }>;
  requestSystemPermission(options: { permission: NativePermissionKey }): Promise<{ opened: boolean; supported: boolean }>;
  secureGet(options: { key: string }): Promise<SecureRead>;
  secureSet(options: { key: string; value: string }): Promise<NativeResult>;
  secureRemove(options: { key: string }): Promise<NativeResult>;
  secureClearOwned(): Promise<NativeResult>;
  setSelfUninstallBlocked(options: { blocked: boolean }): Promise<NativeResult>;
  setKioskMode(options: { enabled: boolean }): Promise<NativeResult>;
  setScreenCaptureAllowed(options: { allowed: boolean }): Promise<NativeResult>;
};

type CapacitorWindow = Window & {
  Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
};

function isNativeRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const capacitor = (window as CapacitorWindow).Capacitor;
  return Boolean(capacitor?.isNativePlatform?.());
}

let pluginPromise: Promise<SecurityAdminNative | null> | null = null;
async function getNativePlugin(): Promise<SecurityAdminNative | null> {
  if (!isNativeRuntime()) return null;
  pluginPromise ??= Promise.resolve(registerPlugin<SecurityAdminNative>("SecurityAdmin"));
  return pluginPromise;
}

export function isNativeAndroid(): boolean {
  if (!isNativeRuntime() || typeof window === "undefined") return false;
  return (window as CapacitorWindow).Capacitor?.getPlatform?.() === "android";
}

export async function setScreenCaptureAllowed(allowed: boolean): Promise<boolean> {
  const plugin = await getNativePlugin();
  if (!plugin) return false;
  try {
    return (await plugin.setScreenCaptureAllowed({ allowed })).ok;
  } catch {
    return false;
  }
}

export async function isDeviceAdminActive(): Promise<boolean> {
  const plugin = await getNativePlugin();
  if (!plugin) return false;
  try {
    return (await plugin.isDeviceAdminActive()).active;
  } catch {
    return false;
  }
}

export async function requestDeviceAdmin(): Promise<boolean> {
  const plugin = await getNativePlugin();
  if (!plugin) return false;
  try {
    return (await plugin.requestDeviceAdmin()).granted;
  } catch {
    return false;
  }
}

export async function lockNow(): Promise<boolean> {
  const plugin = await getNativePlugin();
  if (!plugin) return false;
  try {
    return (await plugin.lockNow()).ok;
  } catch {
    return false;
  }
}

export async function isBiometricAvailable(): Promise<boolean> {
  const plugin = await getNativePlugin();
  if (!plugin) return false;
  try {
    return (await plugin.isBiometricAvailable()).available;
  } catch {
    return false;
  }
}

export async function authenticateBiometric(reason: string): Promise<boolean> {
  const plugin = await getNativePlugin();
  if (!plugin) return false;
  try {
    return (await plugin.authenticateBiometric({ reason })).success;
  } catch {
    return false;
  }
}

export async function getPermissionStatus(): Promise<NativePermissionStatus | null> {
  const plugin = await getNativePlugin();
  if (!plugin) return null;
  try {
    return await plugin.getPermissionStatus();
  } catch {
    return null;
  }
}

export async function requestSystemPermission(permission: NativePermissionKey): Promise<{ opened: boolean; supported: boolean }> {
  const plugin = await getNativePlugin();
  if (!plugin) return { opened: false, supported: false };
  try {
    return await plugin.requestSystemPermission({ permission });
  } catch {
    return { opened: false, supported: false };
  }
}

export async function listLaunchableApps(): Promise<Array<{ packageName: string; label: string }> | null> {
  const plugin = await getNativePlugin();
  if (!plugin) return null;
  try {
    return (await plugin.listLaunchableApps()).apps.filter((app) => !!(app.packageName && app.label));
  } catch {
    return null;
  }
}

export async function secureStorageGet(key: string): Promise<SecureRead> {
  const plugin = await getNativePlugin();
  if (!plugin) return { available: false, found: false, value: null };
  try {
    return await plugin.secureGet({ key });
  } catch {
    return { available: false, found: false, value: null };
  }
}

export async function secureStorageSet(key: string, value: string): Promise<boolean> {
  const plugin = await getNativePlugin();
  if (!plugin) return false;
  try {
    return (await plugin.secureSet({ key, value })).ok;
  } catch {
    return false;
  }
}

export async function secureStorageRemove(key: string): Promise<boolean> {
  const plugin = await getNativePlugin();
  if (!plugin) return false;
  try {
    return (await plugin.secureRemove({ key })).ok;
  } catch {
    return false;
  }
}

export async function secureStorageClearOwned(): Promise<boolean> {
  const plugin = await getNativePlugin();
  if (!plugin) return false;
  try {
    return (await plugin.secureClearOwned()).ok;
  } catch {
    return false;
  }
}

export async function setSelfUninstallBlocked(blocked: boolean): Promise<boolean> {
  const plugin = await getNativePlugin();
  if (!plugin) return false;
  try {
    return (await plugin.setSelfUninstallBlocked({ blocked })).ok;
  } catch {
    return false;
  }
}

export async function setKioskMode(enabled: boolean): Promise<boolean> {
  const plugin = await getNativePlugin();
  if (!plugin) return false;
  try {
    return (await plugin.setKioskMode({ enabled })).ok;
  } catch {
    return false;
  }
}
