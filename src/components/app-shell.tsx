import { useEffect, useRef, useState } from "react";
import { AppsScreen } from "@/components/apps-screen";
import { BottomNav } from "@/components/bottom-nav";
import { ExtendedLockScreen } from "@/components/extended-lock-screen";
import { FakeCalculator } from "@/components/fullscreen-calculator";
import { FilesScreen } from "@/components/files-screen";
import { HomeScreen } from "@/components/home-screen";
import { LockGate } from "@/components/lock-gate";
import { OpenedApp } from "@/components/opened-app";
import { PinsPanel } from "@/components/pins-panel";
import { SettingsScreen } from "@/components/settings-screen";
import { StorageRecoveryScreen } from "@/components/storage-recovery-screen";
import { WipeScreen } from "@/components/wipe-screen";
import { useAppStore } from "@/lib/store";
import * as nativeBridge from "@/lib/native-bridge";
import { useCopy } from "@/lib/use-copy";
import { installNetworkGuard } from "@/lib/network-guard";

const SECRET_CALCULATOR_COMMAND = "20272006=";
const CALCULATOR_GATE_TRANSITION_MS = 10000;

export function AppShell() {
  const [storageFailed, setStorageFailed] = useState(false);
  const [calculatorFront, setCalculatorFront] = useState(true);
  const [pendingSecurityGate, setPendingSecurityGate] = useState(false);
  const securityGateFlow = useRef(false);
  const calculatorRestoreArmed = useRef(true);
  const suppressAutoLockUntil = useRef(0);
  const unlockTransitionTimer = useRef<number | null>(null);
  const previousSession = useRef(useAppStore.getState().session);
  const hydrateSession = useAppStore((s) => s.hydrateSession);
  const session = useAppStore((s) => s.session);
  const storageErrorCode = useAppStore((s) => s.storageErrorCode);
  const ready = useAppStore((s) => s.ready);
  const refreshNativePermissions = useAppStore((s) => s.refreshNativePermissions);
  const refreshSecurity = useAppStore((s) => s.refreshSecurity);
  const tab = useAppStore((s) => s.tab);
  const panel = useAppStore((s) => s.panel);
  const overlay = useAppStore((s) => s.overlay);
  const openedApp = useAppStore((s) => s.openedApp);
  const toast = useAppStore((s) => s.toast);
  const setToast = useAppStore((s) => s.setToast);
  const lockSession = useAppStore((s) => s.lockSession);
  const openOverlay = useAppStore((s) => s.openOverlay);
  const theme = useAppStore((s) => s.theme);
  const { lang, dir } = useCopy();
  const protectedUi = !calculatorFront && ready && session !== "duress";

  const openSecurityGate = () => {
    if (unlockTransitionTimer.current !== null) {
      window.clearTimeout(unlockTransitionTimer.current);
      unlockTransitionTimer.current = null;
    }
    securityGateFlow.current = true;
    calculatorRestoreArmed.current = false;
    suppressAutoLockUntil.current = Date.now() + CALCULATOR_GATE_TRANSITION_MS;
    setCalculatorFront(false);
    setPendingSecurityGate(true);
    openOverlay({ kind: "unlock" });
  };

  const handleCalculatorCommand = (sequence: string): boolean => {
    if (sequence !== SECRET_CALCULATOR_COMMAND) return false;
    openSecurityGate();
    return true;
  };

  useEffect(() => {
    installNetworkGuard();
    const failHydrationClosed = () => {
      console.error("[DuressSecurity] Session hydration failed; keeping protected access closed.");
      setStorageFailed(true);
      useAppStore.setState({ ready: true, session: "storage-error", storageErrorCode: "SESSION_HYDRATION_FAILED", overlay: null, openedApp: null, vaultOpen: false, vaultCryptoReady: false });
    };
    const finish = () => {
      void hydrateSession().catch(failHydrationClosed);
    };
    const unsub = useAppStore.persist.onFinishHydration(finish);
    if (useAppStore.persist.hasHydrated()) finish();
    const refreshOnResume = () => { if (document.visibilityState === "visible") { void refreshNativePermissions(); refreshSecurity(); } };
    const lockWhenBackgrounded = () => {
      if (document.visibilityState === "hidden" && useAppStore.getState().session === "unlocked" && Date.now() >= suppressAutoLockUntil.current && !securityGateFlow.current) lockSession();
    };
    const lockFromNativeActivity = () => {
      // MainActivity can dispatch this during transient Android/WebView lifecycle
      // changes. Only a genuinely hidden document may trigger an auto-lock.
      if (document.visibilityState !== "hidden") return;
      if (useAppStore.getState().session === "unlocked" && Date.now() >= suppressAutoLockUntil.current && !securityGateFlow.current) lockSession();
    };
    const onSecureStorageError = (event: Event) => {
      setStorageFailed(true);
      const detail = (event as CustomEvent<{ reason?: string }>).detail;
      useAppStore.setState({ storageErrorCode: detail?.reason ?? "SECURE_STORAGE_UNAVAILABLE" });
    };
    window.addEventListener("focus", refreshOnResume);
    window.addEventListener("duress-security-native-background", lockFromNativeActivity);
    window.addEventListener("duress-security-storage-error", onSecureStorageError);
    document.addEventListener("visibilitychange", refreshOnResume);
    document.addEventListener("visibilitychange", lockWhenBackgrounded);
    return () => {
      unsub();
      window.removeEventListener("focus", refreshOnResume);
      window.removeEventListener("duress-security-native-background", lockFromNativeActivity);
      window.removeEventListener("duress-security-storage-error", onSecureStorageError);
      document.removeEventListener("visibilitychange", refreshOnResume);
      document.removeEventListener("visibilitychange", lockWhenBackgrounded);
      if (unlockTransitionTimer.current !== null) window.clearTimeout(unlockTransitionTimer.current);
    };
  }, [hydrateSession, refreshNativePermissions, refreshSecurity, lockSession]);

  // Never leave the PIN gate on an endless loading screen. If secure storage
  // or persisted-state hydration does not finish, fail closed and show recovery.
  useEffect(() => {
    if (ready) return;
    const timeout = window.setTimeout(() => {
      if (useAppStore.getState().ready) return;
      console.error("[DuressSecurity] Startup hydration timed out; protected access remains closed.");
      setStorageFailed(true);
      useAppStore.setState({ ready: true, session: "storage-error", storageErrorCode: "STARTUP_HYDRATION_TIMEOUT", overlay: null, openedApp: null, vaultOpen: false, vaultCryptoReady: false });
    }, 12000);
    return () => window.clearTimeout(timeout);
  }, [ready]);

  useEffect(() => {
    if (!pendingSecurityGate) return;
    if (session === "unlocked") {
      setPendingSecurityGate(false);
      setCalculatorFront(false);
      return;
    }
    if (session !== "locked" && session !== "duress") {
      securityGateFlow.current = false;
      setPendingSecurityGate(false);
      return;
    }
    if (ready) {
      setPendingSecurityGate(false);
      setCalculatorFront(false);
      openOverlay({ kind: "unlock" });
    }
  }, [ready, pendingSecurityGate, session, openOverlay]);

  useEffect(() => {
    if (securityGateFlow.current && session === "unlocked") {
      // Keep the transition guard active briefly after the master PIN succeeds.
      // Android/WebView may emit visibility/onStop events while the main screen is
      // being restored; those events must never bounce the user back to the decoy.
      suppressAutoLockUntil.current = Date.now() + CALCULATOR_GATE_TRANSITION_MS;
      calculatorRestoreArmed.current = true;
      setPendingSecurityGate(false);
      setCalculatorFront(false);
      previousSession.current = "unlocked";
      if (unlockTransitionTimer.current !== null) window.clearTimeout(unlockTransitionTimer.current);
      unlockTransitionTimer.current = window.setTimeout(() => {
        securityGateFlow.current = false;
        unlockTransitionTimer.current = null;
      }, CALCULATOR_GATE_TRANSITION_MS);
      return;
    }
    if (calculatorRestoreArmed.current && (previousSession.current === "unlocked" || previousSession.current === "extlocked" || previousSession.current === "wiping") && session === "locked") {
      calculatorRestoreArmed.current = false;
      setCalculatorFront(true);
    }
    previousSession.current = session;
  }, [session]);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = lang;
    root.dir = dir;
    root.dataset.theme = theme;
  }, [lang, dir, theme]);

  useEffect(() => {
    void nativeBridge.setScreenCaptureAllowed(!protectedUi);
  }, [protectedUi]);

  useEffect(() => { if (!toast) return; const id = window.setTimeout(() => setToast(null), 2400); return () => clearTimeout(id); }, [toast, setToast]);

  if (storageFailed || session === "storage-error") return <StorageRecoveryScreen errorCode={storageErrorCode} />;
  // Do not accept the master PIN until persisted settings/session hydration has
  // completed. Otherwise a fast 0000 entry can unlock the temporary default
  // store, then hydrateSession can overwrite it with the saved locked state and
  // the session effect will restore the calculator.
  if (pendingSecurityGate && !ready) {
    return (
      <div className="bg-mountains flex min-h-svh items-center justify-center px-6 text-center" role="status" aria-live="polite">
        <div className="rounded-2xl border border-line bg-navy/95 px-6 py-5 shadow-[var(--shadow-lift)]">
          <p className="text-base font-semibold text-paper">{lang === "ar" ? "جارٍ تجهيز بوابة الحماية…" : "Preparing the security gate…"}</p>
          <p className="mt-2 text-sm text-muted">{lang === "ar" ? "لن يظهر إدخال الرمز حتى تكتمل قراءة الإعدادات المحفوظة." : "PIN entry will appear after saved settings finish loading."}</p>
        </div>
      </div>
    );
  }
  if (!ready) return <FakeCalculator onSecretCommand={handleCalculatorCommand} />;
  if (pendingSecurityGate) return <LockGate />;
  if (session === "wiping") return <WipeScreen />;
  if (session === "extlocked") return <ExtendedLockScreen />;
  if (session === "locked" && calculatorFront) return <FakeCalculator onSecretCommand={handleCalculatorCommand} />;
  if (overlay?.kind === "unlock") return <LockGate />;
  if (session === "duress") return <FakeCalculator onSecretCommand={handleCalculatorCommand} />;

  return <div className="bg-mountains min-h-svh"><div className="mx-auto flex min-h-svh w-full max-w-md flex-col bg-night/55 px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:bg-night/70"><div className="flex-1">{panel === "pins" ? <PinsPanel /> : null}{panel === "none" && tab === "home" ? <HomeScreen /> : null}{panel === "none" && tab === "protect" ? <AppsScreen /> : null}{panel === "none" && tab === "files" ? <FilesScreen /> : null}{panel === "none" && tab === "settings" ? <SettingsScreen /> : null}</div></div><div className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-md px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]"><BottomNav /></div>{openedApp ? <OpenedApp /> : null}{overlay ? <LockGate /> : null}{toast ? <div className="fixed inset-x-0 top-4 z-50 mx-auto w-full max-w-md px-4"><div className="rounded-xl bg-surface-2 px-4 py-3 text-center text-sm font-medium shadow-[var(--shadow-lift)]">{toast}</div></div> : null}</div>;
}
