import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { findApp, type DeviceApp } from "@/lib/apps";
import type { Lang } from "@/lib/i18n";
import { nowIso } from "@/lib/utils";
import {
  DEFAULT_PINS as SERVICE_DEFAULT_PINS,
  INITIAL_SECURITY_STATE,
  classifyPin as serviceClassifyPin,
  isExtendedLockActive,
  isValidSecurityStateRecord,
  reconcile,
  sanitizeState,
  startExtendedLock,
  validatePins,
  wipeAppData,
  normalizePin,
  nextLockoutDelayMs,
  EXTENDED_LOCK_MS,
  type SecurityState,
} from "@/lib/security-service";
import * as nativeBridge from "@/lib/native-bridge";
import { appStorage, getStoredValue, setStoredValue } from "@/lib/app-storage";
import { deleteEncryptedAttachment, lockEncryptedVaultSession, persistEncryptedVault, unlockOrCreateEncryptedVault } from "@/lib/vault-crypto";
import { loadConsecutiveMainFailedAttempts, recordSuccessfulMainUnlock } from "@/lib/security-audit";

export const SECURITY_STORAGE_KEY = "duress-security-state";

async function loadSecurity(): Promise<SecurityState | null> {
  try {
    const raw = await getStoredValue(SECURITY_STORAGE_KEY);
    if (!raw) return { ...INITIAL_SECURITY_STATE };
    const parsed: unknown = JSON.parse(raw);
    if (!isValidSecurityStateRecord(parsed)) return nativeBridge.isNativeAndroid() ? null : sanitizeState(parsed);
    return parsed;
  } catch {
    return nativeBridge.isNativeAndroid() ? null : { ...INITIAL_SECURITY_STATE };
  }
}

async function saveSecurity(state: SecurityState): Promise<boolean> {
  try { return await setStoredValue(SECURITY_STORAGE_KEY, JSON.stringify(state)); } catch { return false; }
}

function lockDurationMs(): number {
  try {
    if (import.meta.env.DEV) {
      const v = Number(new URLSearchParams(window.location.search).get("lockSeconds"));
      if (Number.isFinite(v) && v > 0) return v * 1000;
    }
  } catch { /* ignore */ }
  return EXTENDED_LOCK_MS;
}

export type PinKind = "master" | "duress" | "lock" | "format";
export type TabId = "home" | "protect" | "files" | "settings";
export type ThemeName = "dark" | "light";
export type SessionMode = "locked" | "unlocked" | "duress" | "wiping" | "extlocked" | "storage-error";
export type PanelId = "none" | "pins" | "kiosk";
export type PermKey = "overlayPermission" | "usagePermission" | "accessibilityPermission" | "autostartPermission" | "notificationPermission";
export type VaultFile = { id: string; title: string; body: string; updatedAt: string };
export type Pins = Record<PinKind, string>;
export type ConfirmAction =
  | { type: "toggle-home-lock"; value: boolean }
  | { type: "toggle-app-lock"; value: boolean }
  | { type: "toggle-overlay"; value: boolean }
  | { type: "toggle-prevent"; value: boolean }
  | { type: "toggle-kiosk"; value: boolean }
  | { type: "begin-emergency-wipe" }
  | { type: "save-pin"; target: PinKind; value: string }
  | { type: "delete-file"; id: string }
  | { type: "open-vault" }
  | { type: "grant-all" }
  | { type: "grant-one"; key: PermKey };
export type OverlayRequest =
  | { kind: "unlock" }
  | { kind: "confirm"; action: ConfirmAction; title: string }
  | { kind: "set-pin"; target: PinKind }
  | { kind: "app"; packageName: string };
export const DEFAULT_PINS: Pins = { ...SERVICE_DEFAULT_PINS };

const STARTER_FILES: VaultFile[] = [
  { id: "note-1", title: "جهات بديلة", body: "رقم الطوارئ العائلي محفوظ هنا. لا يظهر في وضع الإكراه.", updatedAt: nowIso() },
  { id: "note-2", title: "ملاحظات خاصة", body: "ملفات الخزنة تبقى على هذا الجهاز فقط ولا تُرفع إلى خادم.", updatedAt: nowIso() },
];

function hasLegacyVaultContent(value: unknown): value is VaultFile[] {
  if (!Array.isArray(value)) return false;
  return value.some((file) => {
    if (!file || typeof file !== "object") return false;
    const row = file as Partial<VaultFile>;
    return !STARTER_FILES.some((starter) =>
      starter.id === row.id && starter.title === row.title && starter.body === row.body
    );
  });
}

export type LockBackgroundTarget = "main" | "app";
export type LockBackgroundTransform = { scale: number; x: number; y: number };

type PersistedSlice = {
  lang: Lang; theme: ThemeName; backgroundImage: string | null; backgroundPresetId: string | null;
  mainLockBackgroundImage: string | null; appLockBackgroundImage: string | null;
  mainLockBackgroundPresetId: string | null; appLockBackgroundPresetId: string | null;
  mainLockBackgroundScale: number; mainLockBackgroundX: number; mainLockBackgroundY: number;
  appLockBackgroundScale: number; appLockBackgroundX: number; appLockBackgroundY: number;
  pins: Pins; pinLength: number; homeLockEnabled: boolean; appLockEnabled: boolean; overlayEnabled: boolean;
  preventUninstall: boolean; dedicatedDeviceMode: boolean; deviceOwner: boolean; overlayPermission: boolean; usagePermission: boolean;
  deviceAdmin: boolean; deviceSecure: boolean; accessibilityPermission: boolean; autostartPermission: boolean; notificationPermission: boolean;
  installedApps: DeviceApp[]; lockedPackages: string[]; kioskAllowedPackages: string[]; vault: VaultFile[]; vaultEncrypted: boolean; vaultMigrationRequired: boolean; failedAttempts: number;
  lockoutUntil: number; lockoutLevel: number; lastCheckAt: string; maxAttempts: number; lockTimeoutSec: number; biometricEnabled: boolean;
};
type TransientSlice = { ready: boolean; session: SessionMode; storageErrorCode: string | null; armedEmergencyCode: "7777" | "8888" | null; tab: TabId; panel: PanelId; overlay: OverlayRequest | null; openedApp: string | null; vaultOpen: boolean; vaultCryptoReady: boolean; toast: string | null; security: SecurityState };
type PinSubmitResult = "ok" | "duress" | "wipe" | "extended-lock" | "wrong" | "duplicate" | "lockout" | "need-master" | "armed-emergency";
type Actions = {
  hydrateSession: () => Promise<void>; refreshNativePermissions: () => Promise<void>; setLang: (lang: Lang) => void; setTheme: (theme: ThemeName) => void; setBackgroundImage: (image: string | null, presetId?: string | null) => void;
  setLockBackground: (target: LockBackgroundTarget, image: string | null, presetId: string | null, transform: LockBackgroundTransform) => void;
  setPinLength: (length: 4 | 7 | 10) => void;
  setTab: (tab: TabId) => void; setPanel: (panel: PanelId) => void; lockSession: () => void; setToast: (msg: string | null) => void;
  openOverlay: (req: OverlayRequest) => void; closeOverlay: () => void;
  submitPin: (pin: string) => PinSubmitResult;
  refreshSecurity: () => void; recoverExtendedLock: (masterPin: string) => Promise<boolean>; applyConfirm: (action: ConfirmAction) => void;
  addInstalledApp: (app: DeviceApp) => boolean; syncInstalledApps: (apps: DeviceApp[]) => void; removeInstalledApp: (packageName: string) => void;
  setKioskAllowedPackages: (packages: string[]) => void;
  toggleLockedApp: (packageName: string) => void; openApp: (packageName: string) => void; closeApp: () => void;
  addFile: (title: string, body: string) => Promise<boolean>; updateFile: (id: string, title: string, body: string) => Promise<boolean>; deleteFile: (id: string) => Promise<boolean>;
  setVaultOpen: (open: boolean) => void; unlockEncryptedVault: (passphrase: string) => Promise<{ ok: boolean; reason?: string }>;
  grantPermission: (key: PermKey, value: boolean) => void; wipeLocal: () => void; beginEmergencyWipe: () => void; activateDuressMode: () => void; configuredPinCount: () => number;
  requestDeviceAdminNative: () => Promise<boolean>; setBiometricEnabled: (value: boolean) => void; tryBiometricUnlock: () => Promise<boolean>;
};
export type AppStore = PersistedSlice & TransientSlice & Actions;

function withPins(pins: Pins): Pins {
  const next: Pins = { master: pins.master || DEFAULT_PINS.master, duress: pins.duress ?? "", lock: pins.lock || DEFAULT_PINS.lock, format: pins.format || DEFAULT_PINS.format };
  // Prevent a persisted decoy/lock/wipe PIN from taking precedence over the master PIN.
  const master = normalizePin(next.master);
  for (const kind of ["duress", "lock", "format"] as const) {
    if (next[kind] && normalizePin(next[kind]) === master) next[kind] = DEFAULT_PINS[kind] !== master ? DEFAULT_PINS[kind] : "";
  }
  return next;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      lang: "ar", theme: "dark", backgroundImage: null, backgroundPresetId: null,
      mainLockBackgroundImage: null, appLockBackgroundImage: null, mainLockBackgroundPresetId: null, appLockBackgroundPresetId: null,
      mainLockBackgroundScale: 1, mainLockBackgroundX: 0, mainLockBackgroundY: 0, appLockBackgroundScale: 1, appLockBackgroundX: 0, appLockBackgroundY: 0,
      pins: { ...DEFAULT_PINS }, pinLength: 4, homeLockEnabled: true, appLockEnabled: true, overlayEnabled: true,
      preventUninstall: false, dedicatedDeviceMode: false, deviceOwner: false, overlayPermission: false, usagePermission: false,
      deviceAdmin: false, deviceSecure: false, accessibilityPermission: false, autostartPermission: false, notificationPermission: false,
      installedApps: [], lockedPackages: [], kioskAllowedPackages: [], vault: [...STARTER_FILES], vaultEncrypted: false, vaultMigrationRequired: false,
      failedAttempts: 0, lockoutUntil: 0, lockoutLevel: 0, lastCheckAt: nowIso(), maxAttempts: 5, lockTimeoutSec: 30, biometricEnabled: false,
      ready: false, session: "locked", storageErrorCode: null, armedEmergencyCode: null, tab: "home", panel: "none", overlay: null, openedApp: null, vaultOpen: false, vaultCryptoReady: false, toast: null, security: { ...INITIAL_SECURITY_STATE },
      hydrateSession: async () => { const loaded = await loadSecurity(); if (!loaded) { set({ ready: true, session: "storage-error", storageErrorCode: "secure-storage-unavailable" }); return; } const security = reconcile(loaded); set({ ...security, pins: withPins(security.pins), security, ready: true }); },
      refreshNativePermissions: async () => { const permissions = await nativeBridge.getPermissionStatus(); set({ ...permissions }); },
      setLang: (lang) => set({ lang }), setTheme: (theme) => set({ theme }),
      setBackgroundImage: (image, presetId = null) => set({ backgroundImage: image, backgroundPresetId: presetId }),
      setLockBackground: (target, image, presetId, transform) => set(target === "main" ? { mainLockBackgroundImage: image, mainLockBackgroundPresetId: presetId, mainLockBackgroundScale: transform.scale, mainLockBackgroundX: transform.x, mainLockBackgroundY: transform.y } : { appLockBackgroundImage: image, appLockBackgroundPresetId: presetId, appLockBackgroundScale: transform.scale, appLockBackgroundX: transform.x, appLockBackgroundY: transform.y }),
      setPinLength: (length) => set({ pinLength: length }), setTab: (tab) => set({ tab }), setPanel: (panel) => set({ panel }), lockSession: () => set({ session: "locked", overlay: null, openedApp: null }), setToast: (toast) => set({ toast }), openOverlay: (overlay) => set({ overlay }), closeOverlay: () => set({ overlay: null }),
      submitPin: (pin) => {
        const state = get(); if (state.session === "extlocked") return "lockout"; if (Date.now() < state.lockoutUntil) return "lockout";
        const overlay = state.overlay;
        if (overlay?.kind === "set-pin") { const normalizedPin = normalizePin(pin); if (normalizedPin.length !== state.pinLength) return "wrong"; const candidate = { ...state.pins, [overlay.target]: normalizedPin }; if (validatePins(candidate) === "duplicate") return "duplicate"; set({ overlay: { kind: "confirm", action: { type: "save-pin", target: overlay.target, value: normalizedPin }, title: "" } }); return "need-master"; }
        const typedEmergency = normalizePin(pin);
        const emergencyCode = typedEmergency === "7777" ? "7777" : typedEmergency === "8888" ? "8888" : null;
        if (emergencyCode) {
          if (state.armedEmergencyCode === emergencyCode) {
            set({ armedEmergencyCode: null });
            return "wipe";
          }
          set({ armedEmergencyCode: emergencyCode, toast: get().lang === "ar" ? "الرمز خطأ" : "Wrong PIN" });
          return "armed-emergency";
        }
        if (state.armedEmergencyCode) set({ armedEmergencyCode: null });
        const action = serviceClassifyPin(pin, state.pins);
        if (action === "wipe") { set({ toast: get().lang === "ar" ? "7777: أعد إدخال الرمز لتأكيد إجراء المالك." : "7777: enter the code again to confirm the owner action." }); return "wipe"; }
        if (action === "extended-lock") { set({ session: "extlocked" }); return "extended-lock"; }
        if (action === "duress") { set({ session: "duress" }); return "duress"; }
        if (action === "ok") { set({ session: "unlocked", failedAttempts: 0, lockoutUntil: 0, lockoutLevel: 0, overlay: null }); return "ok"; }
        if (action === "lockout") return "lockout";
        return "wrong";
      },
      refreshSecurity: () => { const security = get().security; set({ security }); },
      recoverExtendedLock: async (masterPin) => { if (normalizePin(masterPin) !== normalizePin(get().pins.master)) return false; set({ session: "unlocked" }); return true; },
      applyConfirm: (action) => { if (action.type === "save-pin") set((s) => ({ pins: { ...s.pins, [action.target]: normalizePin(action.value) }, lastCheckAt: nowIso() })); },
      addInstalledApp: (app) => { if (get().installedApps.some((x) => x.packageName === app.packageName)) return false; set((s) => ({ installedApps: [...s.installedApps, app] })); return true; },
      syncInstalledApps: (apps) => set({ installedApps: apps }), removeInstalledApp: (packageName) => set((s) => ({ installedApps: s.installedApps.filter((x) => x.packageName !== packageName) })),
      setKioskAllowedPackages: (packages) => set({ kioskAllowedPackages: packages }), toggleLockedApp: (packageName) => set((s) => ({ lockedPackages: s.lockedPackages.includes(packageName) ? s.lockedPackages.filter((p) => p !== packageName) : [...s.lockedPackages, packageName] })),
      openApp: (packageName) => set({ openedApp: packageName }), closeApp: () => set({ openedApp: null }),
      addFile: async (title, body) => { set((s) => ({ vault: [...s.vault, { id: crypto.randomUUID(), title, body, updatedAt: nowIso() }] })); return true; },
      updateFile: async (id, title, body) => { set((s) => ({ vault: s.vault.map((f) => f.id === id ? { ...f, title, body, updatedAt: nowIso() } : f) })); return true; },
      deleteFile: async (id) => { set((s) => ({ vault: s.vault.filter((f) => f.id !== id) })); return true; },
      setVaultOpen: (open) => set({ vaultOpen: open }),
      unlockEncryptedVault: async (passphrase) => unlockOrCreateEncryptedVault(passphrase),
      grantPermission: (key, value) => set({ [key]: value } as Partial<AppStore>), wipeLocal: () => wipeAppData(), beginEmergencyWipe: () => set({ session: "wiping" }), activateDuressMode: () => set({ session: "duress" }),
      configuredPinCount: () => Object.values(get().pins).filter(Boolean).length,
      requestDeviceAdminNative: () => nativeBridge.requestDeviceAdmin(), setBiometricEnabled: (value) => set({ biometricEnabled: value }), tryBiometricUnlock: async () => nativeBridge.authenticateBiometric(),
    }),
    { name: SECURITY_STORAGE_KEY, storage: createJSONStorage(() => appStorage) }
  )
);
