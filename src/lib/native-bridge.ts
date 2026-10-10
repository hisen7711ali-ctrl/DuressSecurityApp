/**
 * Defensive bridge to the opt-in Android implementation in android-native/.
 * In a browser/PWA every native operation safely reports unavailable. On Android,
 * the plugin can provide Device Admin, biometric authentication, Keystore-backed
 * storage, real permission-status checks, a transparent app-lock accessibility
 * service and optional Device Owner kiosk controls.
 */
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
  pluginPromise ??= import("@capacitor/core")
    .then(({ registerPlugin }) => registerPlugin<SecurityAdminNative>("SecurityAdmin"))
    .catch(() => null);
  return pluginPromise;
}

export function isNativeAndroid(): boolean {
  if (!isNativeRuntime() || typeof window === "undefined") return false;
  return (window as CapacitorWindow).Capacitor?.getPlatform?.() === "android";
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

/** Opens Android's own Device Admin confirmation; the user chooses whether to grant it. */
export async function requestDeviceAdmin(): Promise<boolean> {
  const plugin = await getNativePlugin();
  if (!plugin) return false;
  try {
    return (await plugin.requestDeviceAdmin()).granted;
  } catch {
    return false;
  }
}

/** Immediately locks the Android system screen, which remains protected by its own credential. */
export async function nativeLockNow(): Promise<boolean> {
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

/** Android reports success/failure only, not the identity of the enrolled finger. */
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

export async function requestSystemPermission(permission: NativePermissionKey): Promise<boolean> {
  const plugin = await getNativePlugin();
  if (!plugin) return false;
  try {
    const result = await plugin.requestSystemPermission({ permission });
    return result.opened && result.supported;
  } catch {
    return false;
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

/** Available only after the owner has explicitly provisioned this as a managed device. */
export async function setSelfUninstallBlocked(blocked: boolean): Promise<boolean> {
  const plugin = await getNativePlugin();
  if (!plugin) return false;
  try {
    return (await plugin.setSelfUninstallBlocked({ blocked })).ok;
  } catch {
    return false;
  }
}

/** Starts/stops an owner-provisioned kiosk session. It is never enabled automatically by a PIN. */
export async function setKioskMode(enabled: boolean): Promise<boolean> {
  const plugin = await getNativePlugin();
  if (!plugin) return false;
  try {
    return (await plugin.setKioskMode({ enabled })).ok;
  } catch {
    return false;
  }
}

/** Clears the app's encrypted namespaced values in the Android Keystore-backed store. */
export async function secureStorageClearOwned(): Promise<boolean> {
  const plugin = await getNativePlugin();
  if (!plugin) return false;
  try {
    return (await plugin.secureClearOwned()).ok;
  } catch {
    return false;
  }
}

/** Returns launcher-visible installed apps on Android, without broad package-list access. */
export async function listLaunchableApps(): Promise<Array<{ packageName: string; label: string }> | null> {
  const plugin = await getNativePlugin();
  if (!plugin) return null;
  try {
    const response = await plugin.listLaunchableApps();
    return response.apps.filter((app) => Boolean(app.packageName && app.label));
  } catch {
    return null;
  }
}
