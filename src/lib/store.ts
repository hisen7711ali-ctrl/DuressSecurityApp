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
import { lockEncryptedVaultSession, persistEncryptedVault, unlockOrCreateEncryptedVault } from "@/lib/vault-crypto";

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
export type PanelId = "none" | "pins";
export type PermKey = "overlayPermission" | "usagePermission" | "accessibilityPermission" | "autostartPermission" | "notificationPermission";
export type VaultFile = { id: string; title: string; body: string; updatedAt: string };
export type Pins = Record<PinKind, string>;
export type ConfirmAction =
  | { type: "toggle-home-lock"; value: boolean }
  | { type: "toggle-app-lock"; value: boolean }
  | { type: "toggle-overlay"; value: boolean }
  | { type: "toggle-prevent"; value: boolean }
  | { type: "toggle-kiosk"; value: boolean }
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

type PersistedSlice = {
  lang: Lang; theme: ThemeName; pins: Pins; homeLockEnabled: boolean; appLockEnabled: boolean; overlayEnabled: boolean;
  preventUninstall: boolean; dedicatedDeviceMode: boolean; deviceOwner: boolean; overlayPermission: boolean; usagePermission: boolean;
  deviceAdmin: boolean; accessibilityPermission: boolean; autostartPermission: boolean; notificationPermission: boolean;
  installedApps: DeviceApp[]; lockedPackages: string[]; vault: VaultFile[]; vaultEncrypted: boolean; vaultMigrationRequired: boolean; failedAttempts: number;
  lockoutUntil: number; lockoutLevel: number; lastCheckAt: string; maxAttempts: number; lockTimeoutSec: number; biometricEnabled: boolean;
};
type TransientSlice = { ready: boolean; session: SessionMode; storageErrorCode: string | null; tab: TabId; panel: PanelId; overlay: OverlayRequest | null; openedApp: string | null; vaultOpen: boolean; vaultCryptoReady: boolean; toast: string | null; security: SecurityState };
type Actions = {
  hydrateSession: () => Promise<void>; refreshNativePermissions: () => Promise<void>; setLang: (lang: Lang) => void; setTheme: (theme: ThemeName) => void;
  setTab: (tab: TabId) => void; setPanel: (panel: PanelId) => void; lockSession: () => void; setToast: (msg: string | null) => void;
  openOverlay: (req: OverlayRequest) => void; closeOverlay: () => void;
  submitPin: (pin: string) => "ok" | "duress" | "wipe" | "extended-lock" | "wrong" | "duplicate" | "lockout" | "need-master";
  refreshSecurity: () => void; recoverExtendedLock: (masterPin: string) => Promise<boolean>; applyConfirm: (action: ConfirmAction) => void;
  addInstalledApp: (app: DeviceApp) => boolean; syncInstalledApps: (apps: DeviceApp[]) => void; removeInstalledApp: (packageName: string) => void;
  toggleLockedApp: (packageName: string) => void; openApp: (packageName: string) => void; closeApp: () => void;
  addFile: (title: string, body: string) => Promise<boolean>; updateFile: (id: string, title: string, body: string) => Promise<boolean>; deleteFile: (id: string) => Promise<boolean>;
  setVaultOpen: (open: boolean) => void; unlockEncryptedVault: (passphrase: string) => Promise<{ ok: boolean; reason?: string }>;
  grantPermission: (key: PermKey, value: boolean) => void; wipeLocal: () => void; configuredPinCount: () => number;
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
      lang: "ar", theme: "dark", pins: { ...DEFAULT_PINS }, homeLockEnabled: true, appLockEnabled: true, overlayEnabled: true,
      preventUninstall: false, dedicatedDeviceMode: false, deviceOwner: false, overlayPermission: false, usagePermission: false,
      deviceAdmin: false, accessibilityPermission: false, autostartPermission: false, notificationPermission: false,
      installedApps: [], lockedPackages: [], vault: [], vaultEncrypted: false, vaultMigrationRequired: false, lastCheckAt: nowIso(), maxAttempts: 3,
      lockTimeoutSec: 20, biometricEnabled: false, ready: false, session: "locked", storageErrorCode: null, tab: "home", panel: "none", overlay: { kind: "unlock" },
      openedApp: null, vaultOpen: false, vaultCryptoReady: false, failedAttempts: 0, lockoutUntil: 0, lockoutLevel: 0, toast: null,
      security: { ...INITIAL_SECURITY_STATE },

      hydrateSession: async () => {
        void get().refreshNativePermissions().catch(() => undefined);
        const homeLock = get().homeLockEnabled;
        const installed = get().installedApps ?? [];
        const allowed = new Set(installed.map((a) => a.packageName));
        const loadedSecurity = await loadSecurity();
        if (loadedSecurity === null) { set({ ready: true, session: "storage-error", storageErrorCode: "SECURITY_RECORD_UNREADABLE", overlay: null, openedApp: null, vaultOpen: false }); return; }
        const security = reconcile(loadedSecurity);
        if (security !== loadedSecurity) {
          const securitySaved = await saveSecurity(security);
          if (!securitySaved && nativeBridge.isNativeAndroid()) {
            set({ ready: true, session: "storage-error", storageErrorCode: "SECURITY_RECORD_SAVE_FAILED", overlay: null, openedApp: null, vaultOpen: false,
              toast: get().lang === "ar" ? "تعذّر حفظ سجل الحماية الآمن؛ تم إيقاف الدخول." : "The encrypted security record could not be saved. Access is paused." });
            return;
          }
        }
        if (isExtendedLockActive(security)) {
          set({ ready: true, pins: withPins(get().pins), installedApps: installed, lockedPackages: (get().lockedPackages ?? []).filter((p) => allowed.has(p)), security,
            session: "extlocked", overlay: null, openedApp: null, vaultOpen: false, panel: "none" });
          return;
        }
        set({ security, ready: true, storageErrorCode: null, pins: withPins(get().pins), installedApps: installed, lockedPackages: (get().lockedPackages ?? []).filter((p) => allowed.has(p)),
          session: homeLock ? "locked" : "unlocked", overlay: homeLock ? { kind: "unlock" } : null,
          failedAttempts: get().lockoutUntil > Date.now() ? get().failedAttempts : 0, lockoutUntil: get().lockoutUntil > Date.now() ? get().lockoutUntil : 0,
          openedApp: null, vaultOpen: false, vaultCryptoReady: false, panel: "none" });
      },

      refreshNativePermissions: async () => {
        const status = await nativeBridge.getPermissionStatus();
        if (!status) { set({ overlayPermission: false, usagePermission: false, accessibilityPermission: false, notificationPermission: false, autostartPermission: false, deviceAdmin: false, preventUninstall: false, dedicatedDeviceMode: false, deviceOwner: false }); return; }
        set({ overlayPermission: status.overlayPermission, usagePermission: status.usagePermission, accessibilityPermission: status.accessibilityPermission, notificationPermission: status.notificationPermission,
          autostartPermission: status.autostartPermission, deviceAdmin: status.deviceAdmin, preventUninstall: status.preventUninstall, dedicatedDeviceMode: status.dedicatedDeviceMode, deviceOwner: status.deviceOwner });
      },
      setLang: (lang) => set({ lang }), setTheme: (theme) => set({ theme }),
      setTab: (tab) => { const state = get(); if (state.tab === "files" && tab !== "files" && state.vaultCryptoReady) { lockEncryptedVaultSession(); set({ tab, panel: "none", vaultOpen: false, vaultCryptoReady: false, vault: [] }); return; } set({ tab, panel: "none" }); },
      setPanel: (panel) => set({ panel }),
      lockSession: () => { const prior = get(); lockEncryptedVaultSession(); set({ session: "locked", overlay: { kind: "unlock" }, tab: "home", panel: "none", openedApp: null, vaultOpen: false, vaultCryptoReady: false, vault: prior.vaultEncrypted ? [] : prior.vault }); },
      setToast: (toast) => set({ toast }),
      refreshSecurity: () => { const current = get().security; const next = reconcile(current); if (next !== current) { void saveSecurity(next); set({ security: next }); } if (get().session === "extlocked" && !isExtendedLockActive(next)) set({ session: "locked", overlay: { kind: "unlock" }, failedAttempts: 0, lockoutUntil: 0 }); },
      recoverExtendedLock: async (masterPin) => { const state = get(); if (state.session !== "extlocked" || normalizePin(masterPin) !== normalizePin(state.pins.master)) return false; const cleared = { ...INITIAL_SECURITY_STATE }; const saved = await saveSecurity(cleared); if (!saved && nativeBridge.isNativeAndroid()) { set({ toast: state.lang === "ar" ? "تعذّر تحديث سجل القفل الآمن؛ لم يتم الاسترداد." : "Secure lock state could not be updated; recovery was not completed." }); return false; } set({ security: cleared, session: "unlocked", overlay: null, tab: "home", panel: "none", failedAttempts: 0, lockoutUntil: 0, lockoutLevel: 0, toast: state.lang === "ar" ? "تم استرداد الوصول بواسطة الرمز الرئيسي" : "Owner recovery completed with the master PIN" }); if (state.dedicatedDeviceMode) await nativeBridge.setKioskMode(false); if (state.preventUninstall) await nativeBridge.setSelfUninstallBlocked(false); await get().refreshNativePermissions(); return true; },

      openOverlay: (overlay) => set({ overlay }),
      closeOverlay: () => { if (get().session === "locked" || get().session === "wiping") return; set({ overlay: null }); },
      applyConfirm: (action) => {
        if (action.type === "toggle-home-lock") set({ homeLockEnabled: action.value });
        if (action.type === "toggle-app-lock") set({ appLockEnabled: action.value, lastCheckAt: nowIso() });
        if (action.type === "toggle-overlay") set({ overlayEnabled: action.value });
        if (action.type === "toggle-prevent") void nativeBridge.setSelfUninstallBlocked(action.value).then(async (ok) => { await get().refreshNativePermissions(); if (!ok) set({ toast: get().lang === "ar" ? "أندرويد لم يسمح بتطبيق سياسة منع الإزالة على هذا الجهاز؛ لم تتغير سياسة الإزالة." : "Android did not allow the uninstall policy on this device; the uninstall policy was not changed." }); });
        if (action.type === "toggle-kiosk") void nativeBridge.setKioskMode(action.value).then(async (ok) => { await get().refreshNativePermissions(); if (!ok) set({ toast: get().lang === "ar" ? "أندرويد لم يسمح بتفعيل وضع الجهاز المخصص على هذا الجهاز." : "Android did not allow dedicated-device mode on this device." }); });
        if (action.type === "save-pin") set((s) => ({ pins: { ...s.pins, [action.target]: normalizePin(action.value) }, lastCheckAt: nowIso() }));
        if (action.type === "delete-file") { const state = get(); if (!state.vaultCryptoReady) { set({ toast: state.lang === "ar" ? "افتح الخزنة المشفّرة أولاً." : "Unlock the encrypted vault first." }); return; } const nextVault = state.vault.filter((f) => f.id !== action.id); void persistEncryptedVault(nextVault).then(() => set({ vault: nextVault })).catch(() => set({ toast: get().lang === "ar" ? "تعذّر حفظ التغيير المشفّر." : "Encrypted vault change could not be saved." })); }
        if (action.type === "open-vault") set({ vaultOpen: true });
        if (action.type === "grant-all") void get().refreshNativePermissions();
        if (action.type === "grant-one") void nativeBridge.requestSystemPermission(action.key).then(async (opened) => { await get().refreshNativePermissions(); if (!opened) set({ toast: get().lang === "ar" ? (action.key === "autostartPermission" ? "إعداد التشغيل التلقائي يختلف حسب الشركة المصنّعة؛ لم يُسجّل كإذن ممنوح." : "تعذّر فتح إعداد الإذن. تحقّق من دعم إصدار Android.") : (action.key === "autostartPermission" ? "Autostart settings vary by manufacturer; it was not marked as granted." : "Could not open this permission setting on this Android version.") }); });
      },

      submitPin: (pin) => {
        const state = get(); if (state.session === "extlocked") return "lockout"; if (Date.now() < state.lockoutUntil) return "lockout";
        const overlay = state.overlay;
        if (overlay?.kind === "set-pin") { const normalizedPin = normalizePin(pin); if (normalizedPin.length !== 4) return "wrong"; const candidate = { ...state.pins, [overlay.target]: normalizedPin }; if (validatePins(candidate) === "duplicate") return "duplicate"; set({ overlay: { kind: "confirm", action: { type: "save-pin", target: overlay.target, value: normalizedPin }, title: "" } }); return "need-master"; }
        const action = serviceClassifyPin(pin, state.pins);
        if (action === "wipe") { lockEncryptedVaultSession(); set({ session: "wiping", overlay: null, panel: "none", openedApp: null, vaultOpen: false, vaultCryptoReady: false, vault: [] }); return "wipe"; }
        if (action === "extended-lock") {
          lockEncryptedVaultSession(); const security = startExtendedLock(Date.now(), lockDurationMs());
          set({ security, session: "extlocked", overlay: null, openedApp: null, vaultOpen: false, vaultCryptoReady: false, vault: state.vaultEncrypted ? [] : state.vault, panel: "none", failedAttempts: 0, lockoutUntil: 0, lockoutLevel: 0 });
          void saveSecurity(security).then((saved) => { if (!saved && nativeBridge.isNativeAndroid()) { const cleared = { ...INITIAL_SECURITY_STATE }; set({ security: cleared, session: "locked", overlay: { kind: "unlock" }, toast: get().lang === "ar" ? "تعذّر حفظ القفل في التخزين الآمن؛ لم يتم تفعيل القفل الممتد." : "Secure storage failed; the extended lock was not activated." }); return; } if (get().deviceAdmin) void nativeBridge.lockNow(); });
          return "extended-lock";
        }
        if (action === "duress") { lockEncryptedVaultSession(); set({ session: "duress", overlay: null, openedApp: null, vaultOpen: false, vaultCryptoReady: false, vault: state.vaultEncrypted ? [] : state.vault, failedAttempts: 0, lockoutUntil: 0, lockoutLevel: 0, panel: "none" }); return "duress"; }
        if (action === "reject") { const attempts = state.failedAttempts + 1; const locked = attempts >= state.maxAttempts; const delayMs = nextLockoutDelayMs(state.lockTimeoutSec, state.lockoutLevel); set({ failedAttempts: locked ? 0 : attempts, lockoutUntil: locked ? Date.now() + delayMs : 0, lockoutLevel: locked ? Math.min(state.lockoutLevel + 1, 13) : state.lockoutLevel, toast: locked ? (state.lang === "ar" ? `تم إيقاف المحاولات مؤقتًا لمدة ${Math.ceil(delayMs / 1000)} ثانية.` : `PIN attempts paused for ${Math.ceil(delayMs / 1000)} seconds.`) : state.toast }); return locked ? "lockout" : "wrong"; }
        if (!overlay || overlay.kind === "unlock") { set({ session: "unlocked", overlay: null, failedAttempts: 0, lockoutUntil: 0, lockoutLevel: 0, lastCheckAt: nowIso() }); return "ok"; }
        if (overlay.kind === "app") { set({ overlay: null, openedApp: overlay.packageName, failedAttempts: 0, lockoutUntil: 0, lockoutLevel: 0 }); return "ok"; }
        if (overlay.kind === "confirm") { get().applyConfirm(overlay.action); set({ overlay: null, failedAttempts: 0, lockoutUntil: 0, lockoutLevel: 0 }); return "ok"; }
        set({ overlay: null, failedAttempts: 0, lockoutUntil: 0, lockoutLevel: 0 }); return "ok";
      },

      addInstalledApp: (app) => { const exists = get().installedApps.some((a) => a.packageName === app.packageName); if (exists) return false; set((s) => ({ installedApps: [...s.installedApps, app], lastCheckAt: nowIso() })); return true; },
      syncInstalledApps: (apps) => set((s) => { const byPackage = new Map(s.installedApps.map((app) => [app.packageName, app])); const synced = apps.map((app) => byPackage.get(app.packageName) ?? app); const visible = new Set(synced.map((app) => app.packageName)); return { installedApps: synced, lockedPackages: s.lockedPackages.filter((packageName) => visible.has(packageName)), lastCheckAt: nowIso() }; }),
      removeInstalledApp: (packageName) => set((s) => ({ installedApps: s.installedApps.filter((a) => a.packageName !== packageName), lockedPackages: s.lockedPackages.filter((p) => p !== packageName), openedApp: s.openedApp === packageName ? null : s.openedApp, lastCheckAt: nowIso() })),
      toggleLockedApp: (packageName) => set((s) => ({ lockedPackages: s.lockedPackages.includes(packageName) ? s.lockedPackages.filter((p) => p !== packageName) : [...s.lockedPackages, packageName], lastCheckAt: nowIso() })),
      openApp: (packageName) => { const s = get(); const isLocked = s.appLockEnabled && s.lockedPackages.includes(packageName); if (isLocked && s.overlayEnabled) { set({ overlay: { kind: "app", packageName } }); return; } set({ openedApp: packageName }); },
      closeApp: () => set({ openedApp: null }),
      addFile: async (title, body) => { const state = get(); if (!state.vaultCryptoReady) return false; const next = [{ id: crypto.randomUUID(), title, body, updatedAt: nowIso() }, ...state.vault]; try { await persistEncryptedVault(next); set({ vault: next }); return true; } catch { set({ toast: get().lang === "ar" ? "تعذّر حفظ الملف مشفّراً؛ أبقينا النص في النموذج." : "Could not save the encrypted file; the editor contents were retained." }); return false; } },
      updateFile: async (id, title, body) => { const state = get(); if (!state.vaultCryptoReady) return false; const next = state.vault.map((f) => (f.id === id ? { ...f, title, body, updatedAt: nowIso() } : f)); try { await persistEncryptedVault(next); set({ vault: next }); return true; } catch { set({ toast: get().lang === "ar" ? "تعذّر حفظ التعديل مشفّراً؛ لم نعتمد التغيير." : "Could not save the encrypted change; the edit was not committed." }); return false; } },
      deleteFile: async (id) => { const state = get(); if (!state.vaultCryptoReady) return false; const next = state.vault.filter((f) => f.id !== id); try { await persistEncryptedVault(next); set({ vault: next }); return true; } catch { set({ toast: get().lang === "ar" ? "تعذّر حذف الملف من الخزنة المشفّرة." : "Could not update the encrypted vault." }); return false; } },
      setVaultOpen: (vaultOpen) => { if (!vaultOpen) { const prior = get(); lockEncryptedVaultSession(); set({ vaultOpen: false, vaultCryptoReady: false, vault: prior.vaultEncrypted ? [] : prior.vault }); return; } set({ vaultOpen: true, vaultCryptoReady: false }); },
      unlockEncryptedVault: async (passphrase) => { try { const state = get(); const legacyFiles = state.vaultEncrypted ? [] : state.vault; const files = await unlockOrCreateEncryptedVault(passphrase, legacyFiles, !state.vaultEncrypted); set({ vault: files, vaultEncrypted: true, vaultMigrationRequired: false, vaultCryptoReady: true }); return { ok: true }; } catch (error) { return { ok: false, reason: error instanceof Error ? error.message : "VAULT_OPEN_FAILED" }; } },
      grantPermission: (key, value) => { if (!value) set({ [key]: false }); else void get().refreshNativePermissions(); },
      wipeLocal: () => { lockEncryptedVaultSession(); void nativeBridge.setSelfUninstallBlocked(false); void nativeBridge.setKioskMode(false); void saveSecurity({ ...INITIAL_SECURITY_STATE }); set({ pins: { ...DEFAULT_PINS }, installedApps: [], lockedPackages: [], vault: [], vaultEncrypted: false, vaultMigrationRequired: false, vaultCryptoReady: false, preventUninstall: false, dedicatedDeviceMode: false, appLockEnabled: false, overlayEnabled: true, homeLockEnabled: true, biometricEnabled: false, session: "locked", security: { ...INITIAL_SECURITY_STATE }, overlay: { kind: "unlock" }, openedApp: null, vaultOpen: false, failedAttempts: 0, lastCheckAt: nowIso(), tab: "home", panel: "none" }); void get().refreshNativePermissions(); },
      configuredPinCount: () => { const { pins } = get(); return (Object.keys(pins) as PinKind[]).filter((k) => pins[k].length === 4).length; },
      requestDeviceAdminNative: async () => { const granted = await nativeBridge.requestDeviceAdmin(); if (granted) set({ deviceAdmin: true }); return granted; },
      setBiometricEnabled: (value) => set({ biometricEnabled: value }),
      tryBiometricUnlock: async () => { const state = get(); if (!state.biometricEnabled || state.session === "extlocked" || Date.now() < state.lockoutUntil) return false; const overlay = state.overlay; if (overlay && overlay.kind !== "unlock" && overlay.kind !== "app") return false; const ok = await nativeBridge.authenticateBiometric(get().lang === "ar" ? "افتح التطبيق" : "Unlock the app"); if (!ok) return false; if (!overlay || overlay.kind === "unlock") { set({ session: "unlocked", overlay: null, failedAttempts: 0, lockoutUntil: 0, lockoutLevel: 0, lastCheckAt: nowIso() }); return true; } if (overlay.kind === "app") { set({ overlay: null, openedApp: overlay.packageName, failedAttempts: 0, lockoutUntil: 0, lockoutLevel: 0 }); return true; } return false; },
    }),
    {
      name: "duress-security-app", storage: createJSONStorage(() => appStorage), version: 6,
      migrate: (persisted) => {
        const old = (persisted ?? {}) as Partial<PersistedSlice>;
        const p = (old.pins ?? {}) as Partial<Pins>;
        const pins: Pins = { master: !p.master || p.master === "8888" ? DEFAULT_PINS.master : normalizePin(p.master), duress: !p.duress || p.duress === "أ111" ? DEFAULT_PINS.duress : normalizePin(p.duress), lock: !p.lock ? DEFAULT_PINS.lock : normalizePin(p.lock), format: !p.format || p.format === "ي111" ? DEFAULT_PINS.format : normalizePin(p.format) };
        const vault = Array.isArray(old.vault) ? old.vault : [];
        const vaultMigrationRequired = old.vaultMigrationRequired === true || (old.vaultEncrypted !== true && hasLegacyVaultContent(vault));
        return { ...old, pins, vault, vaultEncrypted: old.vaultEncrypted === true, vaultMigrationRequired, lockoutLevel: Math.max(0, Math.min(13, Math.floor(Number(old.lockoutLevel) || 0))) } as PersistedSlice;
      },
      partialize: (s) => ({ lang: s.lang, theme: s.theme, pins: s.pins, homeLockEnabled: s.homeLockEnabled, appLockEnabled: s.appLockEnabled, overlayEnabled: s.overlayEnabled, installedApps: s.installedApps, lockedPackages: s.lockedPackages, ...(s.vaultEncrypted ? {} : { vault: s.vault }), vaultEncrypted: s.vaultEncrypted, vaultMigrationRequired: s.vaultMigrationRequired, failedAttempts: s.failedAttempts, lockoutUntil: s.lockoutUntil, lockoutLevel: s.lockoutLevel, lastCheckAt: s.lastCheckAt, maxAttempts: s.maxAttempts, lockTimeoutSec: s.lockTimeoutSec, biometricEnabled: s.biometricEnabled }),
    },
  ),
);

export function appName(lang: Lang, packageName: string, installed: DeviceApp[] = []) { const item = findApp(installed, packageName); if (!item) return packageName; return lang === "ar" ? item.nameAr : item.nameEn; }
