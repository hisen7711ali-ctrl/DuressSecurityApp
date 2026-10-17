import { useEffect, useRef, useState } from "react";
import { AppsScreen } from "@/components/apps-screen";
import { BottomNav } from "@/components/bottom-nav";
import { ExtendedLockScreen } from "@/components/extended-lock-screen";
import { FakeCalculator } from "@/components/fullscreen-calculator";
import { FilesScreen } from "@/components/files-screen";
import { HomeScreen } from "@/components/home-screen";
import { LockGate } from "@/components/lock-gate";
import { OpenedApp } from "@/components/opened-app";
import { PermissionsOnboardingScreen, hasCompletedInitialPermissions } from "@/components/permissions-onboarding-screen";
import { PinsPanel } from "@/components/pins-panel";
import { KioskScreen } from "@/components/kiosk-screen";
import { SettingsScreen } from "@/components/settings-screen";
import { StorageRecoveryScreen } from "@/components/storage-recovery-screen";
import { WipeScreen } from "@/components/wipe-screen";
import { useAppStore } from "@/lib/store";
import * as nativeBridge from "@/lib/native-bridge";
import { useCopy } from "@/lib/use-copy";
import { installNetworkGuard } from "@/lib/network-guard";
import { getCalculatorCommand } from "@/lib/calculator-command";
import { normalizePin } from "@/lib/security-service";
import { clearDocumentPicker, hasDocumentPickerMarker, isDocumentPickerPending } from "@/lib/document-picker-guard";

const CALCULATOR_GATE_TRANSITION_MS = 10000;
const STARTUP_RETRY_DELAY_MS = 3000;
const STARTUP_MAX_RETRIES = 2;
const STARTUP_HYDRATION_WATCHDOG_MS = 80000;
const TERMINAL_STORAGE_ERRORS = new Set(["KEY_MISSING", "DECRYPTION_FAILED", "DEVICE_SECRET_INVALID", "SECURE_STORAGE_DEVICE_SECRET_INVALID"]);

type NativePinActionWindow = Window & {
  __duressSecurityOpenCalculator?: () => void;
  __duressSecurityHandlePinAction?: (pin: string) => void;
  __duressSecurityPendingPinAction?: string;
  __duressSecurityHandleAppLockBiometric?: (targetPackage: string) => void;
  __duressSecurityPendingAppLockBiometricTarget?: string;
};

export function AppShell() {
  const [storageFailed, setStorageFailed] = useState(false);
  const [calculatorFront, setCalculatorFront] = useState(true);
  const [pendingSecurityGate, setPendingSecurityGate] = useState(false);
  const [permissionsReady, setPermissionsReady] = useState(() => hasCompletedInitialPermissions() || !nativeBridge.isNativeAndroid());
  const securityGateFlow = useRef(false); const calculatorRestoreArmed = useRef(true); const suppressAutoLockUntil = useRef(0); const unlockTransitionTimer = useRef<number | null>(null); const previousSession = useRef(useAppStore.getState().session);
  const hydrateSession = useAppStore((s) => s.hydrateSession); const session = useAppStore((s) => s.session); const storageErrorCode = useAppStore((s) => s.storageErrorCode); const ready = useAppStore((s) => s.ready); const refreshNativePermissions = useAppStore((s) => s.refreshNativePermissions); const refreshSecurity = useAppStore((s) => s.refreshSecurity); const tab = useAppStore((s) => s.tab); const vaultOpen = useAppStore((s) => s.vaultOpen); const vaultMigrationRequired = useAppStore((s) => s.vaultMigrationRequired); const vault = useAppStore((s) => s.vault); const setTab = useAppStore((s) => s.setTab); const setVaultOpen = useAppStore((s) => s.setVaultOpen); const panel = useAppStore((s) => s.panel); const overlay = useAppStore((s) => s.overlay); const openedApp = useAppStore((s) => s.openedApp); const toast = useAppStore((s) => s.toast); const setToast = useAppStore((s) => s.setToast); const lockSession = useAppStore((s) => s.lockSession); const openOverlay = useAppStore((s) => s.openOverlay); const theme = useAppStore((s) => s.theme); const backgroundImage = useAppStore((s) => s.backgroundImage); const { lang, dir } = useCopy(); const protectedUi = !calculatorFront && ready && session !== "duress";
  const openSecurityGate = () => { if (unlockTransitionTimer.current !== null) { window.clearTimeout(unlockTransitionTimer.current); unlockTransitionTimer.current = null; } securityGateFlow.current = true; calculatorRestoreArmed.current = false; suppressAutoLockUntil.current = Date.now() + CALCULATOR_GATE_TRANSITION_MS; setCalculatorFront(false); setPendingSecurityGate(true); openOverlay({ kind: "unlock" }); };
  const handleCalculatorCommand = (sequence: string): boolean => { if (sequence !== `${getCalculatorCommand()}=`) return false; openSecurityGate(); return true; };

  useEffect(() => {
    const host = window as NativePinActionWindow;
    const openCalculatorFacade = () => {
      if (unlockTransitionTimer.current !== null) {
        window.clearTimeout(unlockTransitionTimer.current);
        unlockTransitionTimer.current = null;
      }
      securityGateFlow.current = false;
      calculatorRestoreArmed.current = false;
      suppressAutoLockUntil.current = Date.now() + CALCULATOR_GATE_TRANSITION_MS;
      setPendingSecurityGate(false);
      setCalculatorFront(true);
      // Going to the calculator is a decoy-screen transition, not an unlock.
      // Close sensitive sessions and keep the main app locked underneath it.
      useAppStore.getState().lockSession();
      useAppStore.setState({
        session: "locked",
        overlay: null,
        panel: "none",
        openedApp: null,
        vaultOpen: false,
        vaultCryptoReady: false,
        toast: null,
      });
    };
    host.__duressSecurityOpenCalculator = openCalculatorFacade;
    const handleOwnerPinAction = (pin: string) => {
      const state = useAppStore.getState();
      if (!state.ready) {
        host.__duressSecurityPendingPinAction = pin;
        return;
      }
      // These are the same configured owner PIN actions used by the main login.
      // Do not allow a relaunch to bypass a storage error or an active 30-day lock.
      if (state.session === "storage-error" || state.session === "wiping") return;
      if (normalizePin(pin) === normalizePin(state.pins.format)) {
        state.setToast(state.lang === "ar" ? "تم منع الحذف من شاشة القفل. استخدم إجراء الطوارئ الواضح داخل الإعدادات." : "Deletion from the lock screen is blocked. Use the explicit emergency action in settings.");
        return;
      }
      // 4444 is a calculator-facade shortcut in every lock context. It does not
      // unlock the protected app and does not enter a duress data-changing flow.
      if (normalizePin(pin) === normalizePin(state.pins.duress)) {
        openCalculatorFacade();
        return;
      }
      if (state.session === "extlocked") {
        if (Date.now() < state.lockoutUntil) {
          const seconds = Math.ceil((state.lockoutUntil - Date.now()) / 1000);
          state.setToast(state.lang === "ar" ? `انتظر ${seconds} ثانية قبل المحاولة مجددًا.` : `Wait ${seconds} seconds before trying again.`);
          return;
        }
        const typed = normalizePin(pin);
        if (typed === normalizePin(state.pins.format)) { state.setToast(state.lang === "ar" ? "تم منع الحذف التلقائي من وضع القفل الممتد." : "Automatic deletion is blocked from extended-lock recovery."); return; }
        if (typed === normalizePin(state.pins.duress)) { state.activateDuressMode(); return; }
        if (typed === normalizePin(state.pins.lock)) return;
        if (typed === normalizePin(state.pins.master)) { void state.recoverExtendedLock(pin); return; }
        return;
      }
      state.openOverlay({ kind: "unlock" });
      state.submitPin(pin);
    };
    host.__duressSecurityHandlePinAction = handleOwnerPinAction;
    if (host.__duressSecurityPendingPinAction) {
      const pending = host.__duressSecurityPendingPinAction;
      host.__duressSecurityPendingPinAction = undefined;
      handleOwnerPinAction(pending);
    }
    return () => {
      if (host.__duressSecurityOpenCalculator === openCalculatorFacade) {
        delete host.__duressSecurityOpenCalculator;
      }
      if (host.__duressSecurityHandlePinAction === handleOwnerPinAction) {
        delete host.__duressSecurityHandlePinAction;
      }
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const host = window as NativePinActionWindow;
    const pending = host.__duressSecurityPendingPinAction;
    if (pending) {
      host.__duressSecurityPendingPinAction = undefined;
      host.__duressSecurityHandlePinAction?.(pending);
    }
    const pendingBiometricTarget = host.__duressSecurityPendingAppLockBiometricTarget;
    if (pendingBiometricTarget) {
      host.__duressSecurityPendingAppLockBiometricTarget = undefined;
      host.__duressSecurityHandleAppLockBiometric?.(pendingBiometricTarget);
    }
  }, [ready]);

  useEffect(() => {
    const host = window as NativePinActionWindow;
    const handleBiometricTarget = (targetPackage: string) => {
      const state = useAppStore.getState();
      if (!state.ready) {
        host.__duressSecurityPendingAppLockBiometricTarget = targetPackage;
        return;
      }
      if (!state.biometricEnabled || state.session === "storage-error" || state.session === "extlocked" || state.session === "wiping" || state.session === "duress") {
        void nativeBridge.cancelAppLockBiometric(targetPackage);
        state.setToast(state.lang === "ar" ? "البصمة غير متاحة لفتح هذا التطبيق في الحالة الحالية." : "Biometric unlock is unavailable for this app in the current state.");
        return;
      }
      void nativeBridge.completeAppLockBiometric(targetPackage).then((opened) => {
        if (!opened) {
          useAppStore.getState().setToast(useAppStore.getState().lang === "ar"
            ? "لم يكتمل التحقق بالبصمة أو تعذّر فتح التطبيق؛ بقيت الحماية مفعّلة."
            : "Biometric verification did not complete or the app could not be opened; protection remains active.");
        }
      });
    };
    host.__duressSecurityHandleAppLockBiometric = handleBiometricTarget;
    if (host.__duressSecurityPendingAppLockBiometricTarget) {
      const pending = host.__duressSecurityPendingAppLockBiometricTarget;
      host.__duressSecurityPendingAppLockBiometricTarget = undefined;
      handleBiometricTarget(pending);
    }
    return () => {
      if (host.__duressSecurityHandleAppLockBiometric === handleBiometricTarget) {
        delete host.__duressSecurityHandleAppLockBiometric;
      }
    };
  }, []);

  useEffect(() => {
    installNetworkGuard();
    let cancelled = false;
    const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
    const failHydrationClosed = () => { console.error("[DuressSecurity] Session hydration failed; keeping protected access closed."); setStorageFailed(true); useAppStore.setState({ ready: true, session: "storage-error", storageErrorCode: "SESSION_HYDRATION_FAILED", overlay: null, openedApp: null, vaultOpen: false, vaultCryptoReady: false }); };
    const hydrateWithRetry = async () => {
      for (let attempt = 1; attempt <= STARTUP_MAX_RETRIES && !cancelled; attempt += 1) {
        useAppStore.setState({ ready: false, storageErrorCode: null });
        try { await hydrateSession(); } catch { failHydrationClosed(); return; }
        if (cancelled) return;
        const state = useAppStore.getState();
        if (state.session !== "storage-error") return;
        const reason = state.storageErrorCode ?? "SECURITY_RECORD_UNREADABLE";
        if (TERMINAL_STORAGE_ERRORS.has(reason)) { setStorageFailed(true); return; }
        if (attempt === STARTUP_MAX_RETRIES) { setStorageFailed(true); useAppStore.setState({ ready: true, session: "storage-error", storageErrorCode: "STARTUP_SECURE_STORAGE_RETRY_EXHAUSTED" }); return; }
        await sleep(STARTUP_RETRY_DELAY_MS);
      }
    };
    const finish = () => { void hydrateWithRetry(); };
    const unsub = useAppStore.persist.onFinishHydration(finish); if (useAppStore.persist.hasHydrated()) finish();
    let documentPickerReturnTimer: number | null = null;
    const lockIfUnlocked = () => {
      const current = useAppStore.getState();
      if (current.session === "unlocked") current.lockSession();
    };
    const refreshOnResume = () => {
      if (document.visibilityState !== "visible") return;
      void refreshNativePermissions();
      refreshSecurity();
      if (!hasDocumentPickerMarker()) return;
      if (documentPickerReturnTimer !== null) window.clearTimeout(documentPickerReturnTimer);
      if (!isDocumentPickerPending()) {
        clearDocumentPicker();
        lockIfUnlocked();
        return;
      }
      // A successful input change clears the marker before this timer fires.
      // If the picker was canceled or the Activity was recreated, restore the
      // normal fail-closed behavior instead of leaving an unlocked session behind.
      documentPickerReturnTimer = window.setTimeout(() => {
        documentPickerReturnTimer = null;
        if (!hasDocumentPickerMarker()) return;
        clearDocumentPicker();
        lockIfUnlocked();
      }, 2500);
    };
    const lockWhenBackgrounded = () => {
      if (document.visibilityState === "hidden" && !isDocumentPickerPending() && useAppStore.getState().session === "unlocked" && Date.now() >= suppressAutoLockUntil.current && !securityGateFlow.current) lockSession();
    };
    const lockFromNativeActivity = () => {
      if (document.visibilityState !== "hidden" || isDocumentPickerPending()) return;
      if (useAppStore.getState().session === "unlocked" && Date.now() >= suppressAutoLockUntil.current && !securityGateFlow.current) lockSession();
    };
    const onSecureStorageError = (event: Event) => { const detail = (event as CustomEvent<{ reason?: string }>).detail; const reason = detail?.reason ?? "SECURE_STORAGE_UNAVAILABLE"; if (TERMINAL_STORAGE_ERRORS.has(reason) || reason === "STARTUP_SECURE_STORAGE_RETRY_EXHAUSTED" || reason === "SECURE_STORAGE_WRITE_FAILED" || reason === "LEGACY_MIGRATION_FAILED") setStorageFailed(true); useAppStore.setState({ storageErrorCode: reason }); };
    window.addEventListener("focus", refreshOnResume); window.addEventListener("duress-security-native-background", lockFromNativeActivity); window.addEventListener("duress-security-storage-error", onSecureStorageError); document.addEventListener("visibilitychange", refreshOnResume); document.addEventListener("visibilitychange", lockWhenBackgrounded);
    return () => { cancelled = true; unsub(); if (documentPickerReturnTimer !== null) window.clearTimeout(documentPickerReturnTimer); window.removeEventListener("focus", refreshOnResume); window.removeEventListener("duress-security-native-background", lockFromNativeActivity); window.removeEventListener("duress-security-storage-error", onSecureStorageError); document.removeEventListener("visibilitychange", refreshOnResume); document.removeEventListener("visibilitychange", lockWhenBackgrounded); if (unlockTransitionTimer.current !== null) window.clearTimeout(unlockTransitionTimer.current); };
  }, [hydrateSession, refreshNativePermissions, refreshSecurity, lockSession]);

  useEffect(() => {
    if (ready) return;
    const timeout = window.setTimeout(() => { if (useAppStore.getState().ready) return; console.error("[DuressSecurity] Startup hydration watchdog expired; protected access remains closed."); setStorageFailed(true); useAppStore.setState({ ready: true, session: "storage-error", storageErrorCode: "STARTUP_HYDRATION_TIMEOUT", overlay: null, openedApp: null, vaultOpen: false, vaultCryptoReady: false }); }, STARTUP_HYDRATION_WATCHDOG_MS);
    return () => window.clearTimeout(timeout);
  }, [ready]);

  useEffect(() => { if (securityGateFlow.current && session === "unlocked") { suppressAutoLockUntil.current = Date.now() + CALCULATOR_GATE_TRANSITION_MS; calculatorRestoreArmed.current = true; setPendingSecurityGate(false); setCalculatorFront(false); useAppStore.getState().setTab("home"); previousSession.current = "unlocked"; if (unlockTransitionTimer.current !== null) window.clearTimeout(unlockTransitionTimer.current); unlockTransitionTimer.current = window.setTimeout(() => { securityGateFlow.current = false; unlockTransitionTimer.current = null; }, CALCULATOR_GATE_TRANSITION_MS); return; } if (calculatorRestoreArmed.current && (previousSession.current === "unlocked" || previousSession.current === "extlocked" || previousSession.current === "wiping") && session === "locked") { calculatorRestoreArmed.current = false; setCalculatorFront(true); } previousSession.current = session; }, [session]);
  useEffect(() => { if (session !== "unlocked" || !vaultMigrationRequired || vault.length === 0) return; if (tab !== "files") setTab("files"); if (!vaultOpen) setVaultOpen(true); }, [session, vaultMigrationRequired, vault.length, tab, vaultOpen, setTab, setVaultOpen]);
  useEffect(() => { const root = document.documentElement; root.lang = lang; root.dir = dir; root.dataset.theme = theme; root.dataset.customBackground = backgroundImage ? "true" : "false"; if (backgroundImage) root.style.setProperty("--custom-app-background", `linear-gradient(180deg, rgba(6,18,31,.22) 0%, rgba(6,18,31,.70) 100%), url("${backgroundImage}")`); else root.style.removeProperty("--custom-app-background"); }, [lang, dir, theme, backgroundImage]);
  useEffect(() => { void nativeBridge.setScreenCaptureAllowed(!protectedUi); }, [protectedUi]);
  useEffect(() => { if (!toast) return; const id = window.setTimeout(() => setToast(null), 2400); return () => clearTimeout(id); }, [toast, setToast]);

  if (storageFailed || session === "storage-error") return <StorageRecoveryScreen errorCode={storageErrorCode} />;
  if (!ready) return <FakeCalculator onSecretCommand={handleCalculatorCommand} />;
  if (!permissionsReady) return <PermissionsOnboardingScreen onComplete={() => setPermissionsReady(true)} />;
  if (session === "wiping") return <WipeScreen />;
  if (session === "extlocked") return <ExtendedLockScreen />;
  if (session === "duress") return <FakeCalculator onSecretCommand={handleCalculatorCommand} />;
  if (pendingSecurityGate) return <LockGate />;
  if (session === "locked" && calculatorFront) return <FakeCalculator onSecretCommand={handleCalculatorCommand} />;
  if (overlay?.kind === "unlock") return <LockGate />;
  return <div className="bg-mountains min-h-svh"><div className="mx-auto flex min-h-svh w-full max-w-md flex-col bg-night/55 px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:bg-night/70"><div className="flex-1">{panel === "pins" ? <PinsPanel /> : null}{panel === "kiosk" ? <KioskScreen /> : null}{panel === "none" && tab === "home" ? <HomeScreen /> : null}{panel === "none" && tab === "protect" ? <AppsScreen /> : null}{panel === "none" && tab === "files" ? <FilesScreen /> : null}{panel === "none" && tab === "settings" ? <SettingsScreen /> : null}</div></div>{panel !== "kiosk" ? <div className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-md px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]"><BottomNav /></div> : null}{openedApp ? <OpenedApp /> : null}{overlay ? <LockGate /> : null}{toast ? <div className="fixed inset-x-0 top-4 z-50 mx-auto w-full max-w-md px-4"><div className="rounded-xl bg-surface-2 px-4 py-3 text-center text-sm font-medium shadow-[var(--shadow-lift)]">{toast}</div></div> : null}</div>;
}
