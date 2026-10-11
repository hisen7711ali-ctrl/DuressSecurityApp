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
import { useCopy } from "@/lib/use-copy";
import { installNetworkGuard } from "@/lib/network-guard";

const SECRET_CALCULATOR_COMMAND = "0×0×0×9=";

export function AppShell() {
  const [storageFailed, setStorageFailed] = useState(false);
  const [calculatorFront, setCalculatorFront] = useState(true);
  const previousSession = useRef(useAppStore.getState().session);
  const hydrateSession = useAppStore((s) => s.hydrateSession);
  const session = useAppStore((s) => s.session);
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

  const openSecurityGate = () => {
    setCalculatorFront(false);
    openOverlay({ kind: "unlock" });
  };

  // The exact calculator command is the deterministic owner-entry trigger.
  // It must work regardless of the current decoy/duress display state; the PIN gate
  // remains the authorization boundary for the protected workspace.
  const handleCalculatorCommand = (sequence: string): boolean => {
    if (sequence !== SECRET_CALCULATOR_COMMAND) return false;
    openSecurityGate();
    return true;
  };

  useEffect(() => {
    installNetworkGuard();
    const finish = () => { void hydrateSession(); };
    const unsub = useAppStore.persist.onFinishHydration(finish);
    if (useAppStore.persist.hasHydrated()) finish();
    const refreshOnResume = () => { if (document.visibilityState === "visible") { void refreshNativePermissions(); refreshSecurity(); } };
    const lockWhenBackgrounded = () => { if (document.visibilityState === "hidden" && useAppStore.getState().session === "unlocked") lockSession(); };
    const lockFromNativeActivity = () => { if (useAppStore.getState().session === "unlocked") lockSession(); };
    const onSecureStorageError = () => setStorageFailed(true);
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
    };
  }, [hydrateSession, refreshNativePermissions, refreshSecurity, lockSession]);

  useEffect(() => {
    if ((previousSession.current === "unlocked" || previousSession.current === "extlocked" || previousSession.current === "wiping") && session === "locked") setCalculatorFront(true);
    previousSession.current = session;
  }, [session]);
  useEffect(() => { const root = document.documentElement; root.lang = lang; root.dir = dir; root.dataset.theme = theme; }, [lang, dir, theme]);
  useEffect(() => { if (!toast) return; const id = window.setTimeout(() => setToast(null), 2400); return () => clearTimeout(id); }, [toast, setToast]);

  if (storageFailed || session === "storage-error") return <StorageRecoveryScreen />;
  if (!ready) return <FakeCalculator onSecretCommand={handleCalculatorCommand} />;
  if (session === "wiping") return <WipeScreen />;
  if (session === "extlocked") return <ExtendedLockScreen />;

  // The unlock overlay always has priority over the decoy calculator, including
  // duress mode. This is the critical path that prevents the correct hidden trigger
  // from being swallowed by the persistent duress calculator screen.
  if (overlay?.kind === "unlock") return <LockGate />;

  if (session === "duress") return <FakeCalculator onSecretCommand={handleCalculatorCommand} />;
  if (calculatorFront && session === "locked") return <FakeCalculator onSecretCommand={handleCalculatorCommand} />;

  return <div className="bg-mountains min-h-svh"><div className="mx-auto flex min-h-svh w-full max-w-md flex-col bg-night/55 px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:bg-night/70"><div className="flex-1">{panel === "pins" ? <PinsPanel /> : null}{panel === "none" && tab === "home" ? <HomeScreen /> : null}{panel === "none" && tab === "protect" ? <AppsScreen /> : null}{panel === "none" && tab === "files" ? <FilesScreen /> : null}{panel === "none" && tab === "settings" ? <SettingsScreen /> : null}</div></div><div className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-md px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]"><BottomNav /></div>{openedApp ? <OpenedApp /> : null}{overlay ? <LockGate /> : null}{toast ? <div className="fixed inset-x-0 top-4 z-50 mx-auto w-full max-w-md px-4"><div className="rounded-xl bg-surface-2 px-4 py-3 text-center text-sm font-medium shadow-[var(--shadow-lift)]">{toast}</div></div> : null}</div>;
}
