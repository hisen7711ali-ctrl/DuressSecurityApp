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
type TransientSlice = { ready: boolean; session: SessionMode; storageErrorCode: string | null; tab: TabId; panel: PanelId; overlay: OverlayRequest | null; openedApp: string | null; vaultOpen: boolean; vaultCryptoReady: boolean; toast: string | null; security: SecurityState };
type Actions = {
  hydrateSession: () => Promise<void>; refreshNativePermissions: () => Promise<void>; setLang: (lang: Lang) => void; setTheme: (theme: ThemeName) => void; setBackgroundImage: (image: string | null, presetId?: string | null) => void;
  setLockBackground: (target: LockBackgroundTarget, image: string | null, presetId: string | null, transform: LockBackgroundTransform) => void;
  setPinLength: (length: 4 | 7 | 10) => void;
  setTab: (tab: TabId) => void; setPanel: (panel: PanelId) => void; lockSession: () => void; setToast: (msg: string | null) => void;
  openOverlay: (req: OverlayRequest) => void; closeOverlay: () => void;
  submitPin: (pin: string) => "ok" | "duress" | "wipe" | "extended-lock" | "wrong" | "duplicate" | "lockout" | "need-master";
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
      installedApps: [], lockedPackages: [], kioskAllowedPackages: [], vault: [], vaultEncrypted: false, vaultMigrationRequired: false, lastCheckAt: nowIso(), maxAttempts: 3,
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
        const encryptedFailureCount = nativeBridge.isNativeAndroid() ? await loadConsecutiveMainFailedAttempts() : null;
        if (nativeBridge.isNativeAndroid() && encryptedFailureCount === null) {
          set({ ready: true, session: "storage-error", storageErrorCode: "FAILED_ATTEMPT_HISTORY_UNREADABLE", overlay: null, openedApp: null, vaultOpen: false,
            toast: get().lang === "ar" ? "تعذّر قراءة سجل المحاولات المشفّر؛ تم إيقاف الدخول حفاظًا على الحماية." : "The encrypted failed-attempt journal could not be read; access is paused for safety." });
          return;
        }
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
          failedAttempts: nativeBridge.isNativeAndroid()
            ? Math.max(encryptedFailureCount ?? 0, get().lockoutUntil > Date.now() ? get().failedAttempts : 0)
            : (get().lockoutUntil > Date.now() ? get().failedAttempts : 0),
          lockoutUntil: get().lockoutUntil > Date.now() ? get().lockoutUntil : 0,
          openedApp: null, vaultOpen: false, vaultCryptoReady: false, panel: "none" });
      },

      refreshNativePermissions: async () => {
        const status = await nativeBridge.getPermissionStatus();
        if (!status) { set({ overlayPermission: false, usagePermission: false, accessibilityPermission: false, notificationPermission: false, autostartPermission: false, deviceAdmin: false, deviceSecure: false, preventUninstall: false, dedicatedDeviceMode: false, deviceOwner: false }); return; }
        set({ overlayPermission: status.overlayPermission, usagePermission: status.usagePermission, accessibilityPermission: status.accessibilityPermission, notificationPermission: status.notificationPermission,
          autostartPermission: status.autostartPermission, deviceAdmin: status.deviceAdmin, deviceSecure: status.deviceSecure, preventUninstall: status.preventUninstall, dedicatedDeviceMode: status.dedicatedDeviceMode, deviceOwner: status.deviceOwner });
      },
      setLang: (lang) => set({ lang }), setTheme: (theme) => set({ theme }), setBackgroundImage: (backgroundImage, backgroundPresetId = null) => set({ backgroundImage, backgroundPresetId }),
      setPinLength: (length) => { if ([4, 7, 10].includes(length)) set({ pinLength: length }); },
      setLockBackground: (target, image, presetId, transform) => {
        const safe = {
          scale: Math.max(1, Math.min(2, Number(transform.scale) || 1)),
          x: Math.max(-50, Math.min(50, Number(transform.x) || 0)),
          y: Math.max(-50, Math.min(50, Number(transform.y) || 0)),
        };
        set(target === "main"
          ? { mainLockBackgroundImage: image, mainLockBackgroundPresetId: presetId, mainLockBackgroundScale: safe.scale, mainLockBackgroundX: safe.x, mainLockBackgroundY: safe.y }
          : { appLockBackgroundImage: image, appLockBackgroundPresetId: presetId, appLockBackgroundScale: safe.scale, appLockBackgroundX: safe.x, appLockBackgroundY: safe.y });
      },
      setTab: (tab) => { const state = get(); if (state.tab === "files" && tab !== "files" && state.vaultCryptoReady) { lockEncryptedVaultSession(); set({ tab, panel: "none", vaultOpen: false, vaultCryptoReady: false, vault: [] }); return; } set({ tab, panel: "none" }); },
      setPanel: (panel) => set({ panel }),
      setKioskAllowedPackages: (packages) => set({ kioskAllowedPackages: [...new Set(packages.filter((p) => typeof p === "string" && /^[A-Za-z0-9_.]+$/.test(p)))].slice(0, 100) }),
      lockSession: () => { const prior = get(); lockEncryptedVaultSession(); set({ session: "locked", overlay: { kind: "unlock" }, tab: "home", panel: "none", openedApp: null, vaultOpen: false, vaultCryptoReady: false, vault: prior.vaultEncrypted ? [] : prior.vault }); },
      setToast: (toast) => set({ toast }),
      refreshSecurity: () => { const current = get().security; const next = reconcile(current); if (next !== current) { void saveSecurity(next); set({ security: next }); } if (get().session === "extlocked" && !isExtendedLockActive(next)) set({ session: "locked", overlay: { kind: "unlock" }, failedAttempts: 0, lockoutUntil: 0 }); },
      recoverExtendedLock: async (masterPin) => {
        const state = get();
        if (state.session !== "extlocked") return false;
        const now = Date.now();
        if (now < state.lockoutUntil) return false;
        if (normalizePin(masterPin) !== normalizePin(state.pins.master)) {
          const nextAttempts = state.failedAttempts + 1;
          const shouldLockOut = nextAttempts >= state.maxAttempts;
          const delayMs = nextLockoutDelayMs(state.lockTimeoutSec, state.lockoutLevel);
          set({
            failedAttempts: shouldLockOut ? 0 : nextAttempts,
            lockoutUntil: shouldLockOut ? now + delayMs : 0,
            lockoutLevel: shouldLockOut ? Math.min(state.lockoutLevel + 1, 13) : state.lockoutLevel,
            toast: shouldLockOut
              ? (state.lang === "ar" ? `تم إيقاف محاولات الاسترداد مؤقتًا لمدة ${Math.ceil(delayMs / 1000)} ثانية.` : `Recovery attempts paused for ${Math.ceil(delayMs / 1000)} seconds.`)
              : null,
          });
          return false;
        }
        if (nativeBridge.isNativeAndroid() && !(await recordSuccessfulMainUnlock())) {
          set({
            ready: true,
            session: "storage-error",
            storageErrorCode: "FAILED_ATTEMPT_HISTORY_WRITE_FAILED",
            overlay: null,
            openedApp: null,
            vaultOpen: false,
            vaultCryptoReady: false,
            toast: state.lang === "ar"
              ? "تعذّر حفظ إعادة ضبط عدّاد المحاولات؛ بقيت الحماية مفعّلة."
              : "Could not save the attempt-counter reset; protection remains enabled.",
          });
          return false;
        }
        const cleared = { ...INITIAL_SECURITY_STATE };
        const saved = await saveSecurity(cleared);
        if (!saved && nativeBridge.isNativeAndroid()) {
          set({ toast: state.lang === "ar" ? "تعذّر تحديث سجل القفل الآمن؛ لم يتم الاسترداد." : "Secure lock state could not be updated; recovery was not completed." });
          return false;
        }
        // Recovery ends the app-level maintenance lock only. It must not silently
        // disable separately configured Kiosk or uninstall-block policies.
        set({
          security: cleared,
          session: "unlocked",
          overlay: null,
          tab: "home",
          panel: "none",
          failedAttempts: 0,
          lockoutUntil: 0,
          lockoutLevel: 0,
          toast: state.lang === "ar" ? "تم استرداد الوصول بواسطة الرمز الرئيسي" : "Owner recovery completed with the master PIN",
        });
        await get().refreshNativePermissions();
        return true;
      },

      openOverlay: (overlay) => set({ overlay }),
      closeOverlay: () => { if (get().session === "locked" || get().session === "wiping") return; set({ overlay: null }); },
      applyConfirm: (action) => {
        if (action.type === "toggle-home-lock") set({ homeLockEnabled: action.value });
        if (action.type === "toggle-app-lock") {
          set({ appLockEnabled: action.value, lastCheckAt: nowIso() });
          // Enabling App Lock immediately guides the owner to Android's
          // Accessibility settings when the required service is not enabled.
          // Android still requires the owner to grant it explicitly.
          if (action.value && nativeBridge.isNativeAndroid()) {
            void (async () => {
              await get().refreshNativePermissions();
              if (get().accessibilityPermission) return;
              const opened = await nativeBridge.requestSystemPermission("accessibilityPermission");
              await get().refreshNativePermissions();
              set({ toast: get().lang === "ar"
                ? (opened.opened
                  ? "فعّل خدمة Duress Security من إعدادات إمكانية الوصول ثم ارجع إلى التطبيق."
                  : "تعذّر فتح إعدادات إمكانية الوصول؛ افتحها يدويًا وفعّل خدمة Duress Security.")
                : (opened.opened
                  ? "Enable the Duress Security service in Android Accessibility settings, then return to the app."
                  : "Could not open Accessibility settings; open them manually and enable the Duress Security service.") });
            })();
          }
        }
        if (action.type === "toggle-overlay") set({ overlayEnabled: action.value });
        if (action.type === "toggle-prevent") void nativeBridge.setSelfUninstallBlocked(action.value).then(async (ok) => {
          await get().refreshNativePermissions();
          if (!ok && action.value) {
            const state = get();
            const message = !nativeBridge.isNativeAndroid()
              ? (state.lang === "ar" ? "منع الإزالة متاح فقط داخل نسخة Android المثبّتة." : "Uninstall protection is only available in the installed Android app.")
              : !state.deviceOwner
                ? (state.lang === "ar" ? "لم يُفعّل منع الإزالة: يجب إعداد التطبيق كمالك الجهاز (Device Owner). صلاحية مسؤول الجهاز وحدها لا تكفي." : "Uninstall protection was not enabled: this app must be provisioned as Device Owner. Device Admin alone is not enough.")
                : (state.lang === "ar" ? "أندرويد لم يؤكد تفعيل سياسة منع الإزالة؛ لم يتم تفعيلها." : "Android did not confirm the uninstall-block policy; it was not enabled.");
            set({ toast: message });
          }
        });
        if (action.type === "toggle-kiosk") void nativeBridge.setKioskMode(action.value, get().kioskAllowedPackages).then(async (ok) => { await get().refreshNativePermissions(); if (!ok) set({ toast: get().lang === "ar" ? "أندرويد لم يسمح بتفعيل وضع الجهاز المخصص على هذا الجهاز." : "Android did not allow dedicated-device mode on this device." }); });
        if (action.type === "save-pin") set((s) => ({ pins: { ...s.pins, [action.target]: normalizePin(action.value) }, lastCheckAt: nowIso() }));
        if (action.type === "delete-file") { void get().deleteFile(action.id); }
        if (action.type === "open-vault") set({ vaultOpen: true });
        if (action.type === "grant-all") void get().refreshNativePermissions();
        if (action.type === "grant-one") void nativeBridge.requestSystemPermission(action.key).then(async (opened) => { await get().refreshNativePermissions(); if (!opened) set({ toast: get().lang === "ar" ? (action.key === "autostartPermission" ? "إعداد التشغيل التلقائي يختلف حسب الشركة المصنّعة؛ لم يُسجّل كإذن ممنوح." : "تعذّر فتح إعداد الإذن. تحقّق من دعم إصدار Android.") : (action.key === "autostartPermission" ? "Autostart settings vary by manufacturer; it was not marked as granted." : "Could not open this permission setting on this Android version.") }); });
      },

      submitPin: (pin) => {
        const state = get(); if (state.session === "extlocked") return "lockout"; if (Date.now() < state.lockoutUntil) return "lockout";
        const overlay = state.overlay;
        if (overlay?.kind === "set-pin") { const normalizedPin = normalizePin(pin); if (normalizedPin.length !== state.pinLength) return "wrong"; const candidate = { ...state.pins, [overlay.target]: normalizedPin }; if (validatePins(candidate) === "duplicate") return "duplicate"; set({ overlay: { kind: "confirm", action: { type: "save-pin", target: overlay.target, value: normalizedPin }, title: "" } }); return "need-master"; }
        const action = serviceClassifyPin(pin, state.pins);
        if (action === "wipe") { get().beginEmergencyWipe(); return "wipe"; }
        if (action === "extended-lock") {
          lockEncryptedVaultSession(); const security = startExtendedLock(Date.now(), lockDurationMs());
          set({ security, session: "extlocked", overlay: null, openedApp: null, vaultOpen: false, vaultCryptoReady: false, vault: state.vaultEncrypted ? [] : state.vault, panel: "none", failedAttempts: 0, lockoutUntil: 0, lockoutLevel: 0 });
          void saveSecurity(security).then(async (saved) => {
            if (!saved && nativeBridge.isNativeAndroid()) {
              const cleared = { ...INITIAL_SECURITY_STATE };
              set({ security: cleared, session: "locked", overlay: { kind: "unlock" }, toast: get().lang === "ar" ? "تعذّر حفظ القفل في التخزين الآمن؛ لم يتم تفعيل القفل الممتد." : "Secure storage failed; the extended lock was not activated." });
              return;
            }
            if (!nativeBridge.isNativeAndroid()) return;
            let nativeStatus = await nativeBridge.getPermissionStatus();
            const currentLang = get().lang;
            if (!nativeStatus?.deviceAdmin) {
              // 5555 explicitly requests Device Admin through Android's own
              // consent screen. The owner must approve it; never self-grant.
              const granted = await nativeBridge.requestDeviceAdmin();
              await get().refreshNativePermissions();
              nativeStatus = await nativeBridge.getPermissionStatus();
              if (!granted || !nativeStatus?.deviceAdmin) {
                set({ toast: currentLang === "ar"
                  ? "بقيت صيانة التطبيق فعّالة، لكنك لم تمنح مسؤول الجهاز؛ لم يتم قفل شاشة الهاتف."
                  : "App maintenance remains active, but Device Admin was not granted; Android's screen was not locked." });
                return;
              }
            }
            if (!nativeStatus?.deviceSecure) {
              set({ toast: currentLang === "ar"
                ? "تم تفعيل صيانة التطبيق، لكن الهاتف لا يملك قفل شاشة آمناً. اضبط PIN أو نمطاً من إعدادات أندرويد أولاً."
                : "App maintenance is active, but Android has no secure screen lock. Set a PIN or pattern in Android Settings first." });
              return;
            }
            const locked = await nativeBridge.lockNow();
            if (!locked) {
              set({ toast: get().lang === "ar"
                ? "تعذّر طلب قفل شاشة أندرويد. تأكد من صلاحية مسؤول الجهاز وقفل الشاشة الآمن."
                : "Android did not confirm the screen-lock request. Check Device Admin and the secure screen lock." });
            }
          });
          return "extended-lock";
        }
        if (action === "duress") {
          // On the main/app lock keypad, 4444 returns to the locked calculator
          // facade. It is not an unlock, does not open the vault, and must not
          // clear security state. The explicit event keeps presentation logic
          // out of the persistent store.
          if ((overlay?.kind === "unlock" || overlay?.kind === "app") &&
              state.session !== "extlocked" && state.session !== "storage-error" &&
              state.session !== "wiping" && typeof window !== "undefined") {
            window.dispatchEvent(new Event("duress-security-open-calculator"));
            return "duress";
          }
          get().activateDuressMode();
          return "duress";
        }
        if (action === "reject") {
          const attempts = state.failedAttempts + 1;
          const locked = attempts >= state.maxAttempts;
          const delayMs = nextLockoutDelayMs(state.lockTimeoutSec, state.lockoutLevel);
          set({
            failedAttempts: locked ? 0 : attempts,
            lockoutUntil: locked ? Date.now() + delayMs : 0,
            lockoutLevel: locked ? Math.min(state.lockoutLevel + 1, 13) : state.lockoutLevel,
            toast: locked ? (state.lang === "ar" ? `تم إيقاف المحاولات مؤقتًا لمدة ${Math.ceil(delayMs / 1000)} ثانية.` : `PIN attempts paused for ${Math.ceil(delayMs / 1000)} seconds.`) : state.toast,
          });
          // Repeated failed PINs may lock the phone only when the owner already
          // granted Device Admin and configured a secure Android keyguard. Never
          // open a system permission prompt in response to wrong PIN attempts.
          if (locked && nativeBridge.isNativeAndroid()) {
            void nativeBridge.getPermissionStatus().then((status) => {
              if (status?.deviceAdmin && status.deviceSecure) void nativeBridge.lockNow();
            });
          }
          return locked ? "lockout" : "wrong";
        }
        if (!overlay || overlay.kind === "unlock") { set({ session: "unlocked", overlay: null, tab: "home", panel: "none", failedAttempts: 0, lockoutUntil: 0, lockoutLevel: 0, lastCheckAt: nowIso() }); return "ok"; }
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
      deleteFile: async (id) => { const state = get(); if (!state.vaultCryptoReady) return false; const removed = state.vault.find((f) => f.id === id); const attachmentId = removed?.body.match(/^vault-file-v(?:1|2):([^:]+)/)?.[1]; const next = state.vault.filter((f) => f.id !== id); try { await persistEncryptedVault(next); set({ vault: next }); if (attachmentId) { try { await deleteEncryptedAttachment(attachmentId); } catch { /* Private orphan ciphertext is removed by app-data wipe. */ } } return true; } catch { set({ toast: get().lang === "ar" ? "تعذّر حذف الملف من الخزنة المشفّرة." : "Could not update the encrypted vault." }); return false; } },
      setVaultOpen: (vaultOpen) => { if (!vaultOpen) { const prior = get(); lockEncryptedVaultSession(); set({ vaultOpen: false, vaultCryptoReady: false, vault: prior.vaultEncrypted ? [] : prior.vault }); return; } set({ vaultOpen: true, vaultCryptoReady: false }); },
      unlockEncryptedVault: async (passphrase) => { try { const state = get(); const legacyFiles = state.vaultEncrypted ? [] : state.vault; const files = await unlockOrCreateEncryptedVault(passphrase, legacyFiles, !state.vaultEncrypted); set({ vault: files, vaultEncrypted: true, vaultMigrationRequired: false, vaultCryptoReady: true }); return { ok: true }; } catch (error) { return { ok: false, reason: error instanceof Error ? error.message : "VAULT_OPEN_FAILED" }; } },
      grantPermission: (key, value) => { if (!value) set({ [key]: false }); else void get().refreshNativePermissions(); },
      wipeLocal: () => {
        lockEncryptedVaultSession();
        void nativeBridge.setSelfUninstallBlocked(false);
        void nativeBridge.setKioskMode(false);
        void saveSecurity({ ...INITIAL_SECURITY_STATE });
        set({
          lang: "ar", theme: "dark", backgroundImage: null, backgroundPresetId: null,
          mainLockBackgroundImage: null, appLockBackgroundImage: null, mainLockBackgroundPresetId: null, appLockBackgroundPresetId: null,
          mainLockBackgroundScale: 1, mainLockBackgroundX: 0, mainLockBackgroundY: 0, appLockBackgroundScale: 1, appLockBackgroundX: 0, appLockBackgroundY: 0,
          pins: { ...DEFAULT_PINS }, pinLength: 4,
          homeLockEnabled: true, appLockEnabled: true, overlayEnabled: true,
          preventUninstall: false, dedicatedDeviceMode: false, deviceOwner: false,
          overlayPermission: false, usagePermission: false, accessibilityPermission: false,
          autostartPermission: false, notificationPermission: false, deviceAdmin: false, deviceSecure: false,
          installedApps: [], lockedPackages: [], kioskAllowedPackages: [], vault: [], vaultEncrypted: false,
          vaultMigrationRequired: false, vaultCryptoReady: false, biometricEnabled: false,
          maxAttempts: 3, lockTimeoutSec: 20, failedAttempts: 0, lockoutUntil: 0, lockoutLevel: 0,
          session: "locked", security: { ...INITIAL_SECURITY_STATE }, overlay: { kind: "unlock" },
          openedApp: null, vaultOpen: false, toast: null, lastCheckAt: nowIso(), tab: "home", panel: "none",
        });
        // Refresh actual Android-managed permissions; app data reset cannot silently revoke user-granted special access.
        void get().refreshNativePermissions();
      },
      beginEmergencyWipe: () => { lockEncryptedVaultSession(); set({ session: "wiping", overlay: null, panel: "none", openedApp: null, vaultOpen: false, vaultCryptoReady: false, vault: [] }); },
      activateDuressMode: () => { const state = get(); lockEncryptedVaultSession(); set({ session: "duress", overlay: null, openedApp: null, vaultOpen: false, vaultCryptoReady: false, vault: state.vaultEncrypted ? [] : state.vault, failedAttempts: 0, lockoutUntil: 0, lockoutLevel: 0, panel: "none" }); },
      configuredPinCount: () => { const { pins, pinLength } = get(); return (Object.keys(pins) as PinKind[]).filter((k) => pins[k].length === pinLength).length; },
      requestDeviceAdminNative: async () => { const granted = await nativeBridge.requestDeviceAdmin(); if (granted) set({ deviceAdmin: true }); return granted; },
      setBiometricEnabled: (value) => set({ biometricEnabled: value }),
      tryBiometricUnlock: async () => { const state = get(); if (!state.biometricEnabled || state.session === "extlocked" || Date.now() < state.lockoutUntil) return false; const overlay = state.overlay; if (overlay && overlay.kind !== "unlock" && overlay.kind !== "app") return false; const ok = await nativeBridge.authenticateBiometric(get().lang === "ar" ? "افتح التطبيق" : "Unlock the app"); if (!ok) return false; if (!overlay || overlay.kind === "unlock") { set({ session: "unlocked", overlay: null, failedAttempts: 0, lockoutUntil: 0, lockoutLevel: 0, lastCheckAt: nowIso() }); return true; } if (overlay.kind === "app") { set({ overlay: null, openedApp: overlay.packageName, failedAttempts: 0, lockoutUntil: 0, lockoutLevel: 0 }); return true; } return false; },
    }),
    {
      name: "duress-security-app", storage: createJSONStorage(() => appStorage), version: 9,
      migrate: (persisted) => {
        const old = (persisted ?? {}) as Partial<PersistedSlice>;
        const p = (old.pins ?? {}) as Partial<Pins>;
        const pins: Pins = { master: !p.master || p.master === "8888" ? DEFAULT_PINS.master : normalizePin(p.master), duress: !p.duress || p.duress === "أ111" ? DEFAULT_PINS.duress : normalizePin(p.duress), lock: !p.lock ? DEFAULT_PINS.lock : normalizePin(p.lock), format: !p.format || p.format === "ي111" ? DEFAULT_PINS.format : normalizePin(p.format) };
        const vault = Array.isArray(old.vault) ? old.vault : [];
        const vaultMigrationRequired = old.vaultMigrationRequired === true || (old.vaultEncrypted !== true && hasLegacyVaultContent(vault));
        return { ...old, pins, vault, backgroundPresetId: typeof old.backgroundPresetId === "string" ? old.backgroundPresetId : null,
          mainLockBackgroundImage: typeof old.mainLockBackgroundImage === "string" ? old.mainLockBackgroundImage : (typeof old.backgroundImage === "string" ? old.backgroundImage : null),
          appLockBackgroundImage: typeof old.appLockBackgroundImage === "string" ? old.appLockBackgroundImage : null,
          mainLockBackgroundPresetId: typeof old.mainLockBackgroundPresetId === "string" ? old.mainLockBackgroundPresetId : (typeof old.backgroundPresetId === "string" ? old.backgroundPresetId : null),
          appLockBackgroundPresetId: typeof old.appLockBackgroundPresetId === "string" ? old.appLockBackgroundPresetId : null,
          mainLockBackgroundScale: Math.max(1, Math.min(2, Number(old.mainLockBackgroundScale) || 1)),
          kioskAllowedPackages: Array.isArray(old.kioskAllowedPackages) ? old.kioskAllowedPackages.filter((p): p is string => typeof p === "string" && /^[A-Za-z0-9_.]+$/.test(p)).slice(0, 100) : [],
          mainLockBackgroundX: Math.max(-50, Math.min(50, Number(old.mainLockBackgroundX) || 0)),
          mainLockBackgroundY: Math.max(-50, Math.min(50, Number(old.mainLockBackgroundY) || 0)),
          pinLength: [4, 7, 10].includes(Number(old.pinLength)) ? Number(old.pinLength) : 4,
          appLockBackgroundScale: Math.max(1, Math.min(2, Number(old.appLockBackgroundScale) || 1)),
          appLockBackgroundX: Math.max(-50, Math.min(50, Number(old.appLockBackgroundX) || 0)),
          appLockBackgroundY: Math.max(-50, Math.min(50, Number(old.appLockBackgroundY) || 0)),
          vaultEncrypted: old.vaultEncrypted === true, vaultMigrationRequired, lockoutLevel: Math.max(0, Math.min(13, Math.floor(Number(old.lockoutLevel) || 0))) } as PersistedSlice;
      },
      partialize: (s) => ({ lang: s.lang, theme: s.theme, backgroundImage: s.backgroundImage, backgroundPresetId: s.backgroundPresetId,
        mainLockBackgroundImage: s.mainLockBackgroundImage, appLockBackgroundImage: s.appLockBackgroundImage,
        mainLockBackgroundPresetId: s.mainLockBackgroundPresetId, appLockBackgroundPresetId: s.appLockBackgroundPresetId,
        mainLockBackgroundScale: s.mainLockBackgroundScale, mainLockBackgroundX: s.mainLockBackgroundX, mainLockBackgroundY: s.mainLockBackgroundY,
        appLockBackgroundScale: s.appLockBackgroundScale, appLockBackgroundX: s.appLockBackgroundX, appLockBackgroundY: s.appLockBackgroundY, kioskAllowedPackages: s.kioskAllowedPackages, pins: s.pins, pinLength: s.pinLength, homeLockEnabled: s.homeLockEnabled, appLockEnabled: s.appLockEnabled, overlayEnabled: s.overlayEnabled, installedApps: s.installedApps, lockedPackages: s.lockedPackages, ...(s.vaultEncrypted ? {} : { vault: s.vault }), vaultEncrypted: s.vaultEncrypted, vaultMigrationRequired: s.vaultMigrationRequired, failedAttempts: s.failedAttempts, lockoutUntil: s.lockoutUntil, lockoutLevel: s.lockoutLevel, lastCheckAt: s.lastCheckAt, maxAttempts: s.maxAttempts, lockTimeoutSec: s.lockTimeoutSec, biometricEnabled: s.biometricEnabled }),
    },
  ),
);

export function appName(lang: Lang, packageName: string, installed: DeviceApp[] = []) { const item = findApp(installed, packageName); if (!item) return packageName; return lang === "ar" ? item.nameAr : item.nameEn; }
