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
const HYDRATION_RETRY_DELAY_MS = 3000;
const HYDRATION_MAX_FAILURES = 40;
const PERMANENT_STORAGE_REASONS = new Set(["KEY_MISSING", "DECRYPTION_FAILED"]);
const NON_BLOCKING_STORAGE_REASONS = new Set(["SECURE_STORAGE_WRITE_FAILED", "SECURE_STORAGE_REMOVE_FAILED"]);

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
  const vaultOpen = useAppStore((s) => s.vaultOpen);
  const vaultMigrationRequired = useAppStore((s) => s.vaultMigrationRequired);
  const vault = useAppStore((s) => s.vault);
  const setTab = useAppStore((s) => s.setTab);
  const setVaultOpen = useAppStore((s) => s.setVaultOpen);
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
    const noteHydrationFailure = (error: unknown) => {
      const code = error instanceof Error ? error.message : "SESSION_HYDRATION_FAILED";
      useAppStore.setState({ storageErrorCode: code });
    };
    const finish = () => { void hydrateSession().catch(noteHydrationFailure); };
    const unsub = useAppStore.persist.onFinishHydration(finish);
    if (useAppStore.persist.hasHydrated()) finish();
    const refreshOnResume = () => { if (document.visibilityState === "visible") { void refreshNativePermissions(); refreshSecurity(); } };
    const lockWhenBackgrounded = () => {
      if (document.visibilityState === "hidden" && useAppStore.getState().session === "unlocked" && Date.now() >= suppressAutoLockUntil.current && !securityGateFlow.current) lockSession();
    };
    const lockFromNativeActivity = () => {
      if (document.visibilityState !== "hidden") return;
      if (useAppStore.getState().session === "unlocked" && Date.now() >= suppressAutoLockUntil.current && !securityGateFlow.current) lockSession();
    };
    const onSecureStorageError = (event: Event) => {
      const reason = (event as CustomEvent<{ reason?: string }>).detail?.reason ?? "SECURE_STORAGE_UNAVAILABLE";
      useAppStore.setState({ storageErrorCode: reason });
      if (PERMANENT_STORAGE_REASONS.has(reason)) setStorageFailed(true);
      else if (NON_BLOCKING_STORAGE_REASONS.has(reason)) useAppStore.getState().setToast(useAppStore.getState().lang === "ar" ? "تعذّر حفظ التغيير الآمن، أعد المحاولة." : "A secure change could not be saved. Try again.");
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

  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    let failures = 0;
    const run = async () => {
      while (!cancelled && !useAppStore.getState().ready) {
        await new Promise((resolve) => window.setTimeout(resolve, HYDRATION_RETRY_DELAY_MS));
        if (cancelled || useAppStore.getState().ready) return;
        try {
          await Promise.resolve(useAppStore.persist.rehydrate());
          await hydrateSession();
        } catch (error) {
          failures += 1;
          useAppStore.setState({ storageErrorCode: error instanceof Error ? error.message : "SESSION_HYDRATION_FAILED" });
          if (failures >= HYDRATION_MAX_FAILURES) { setStorageFailed(true); return; }
        }
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [ready, hydrateSession]);

  useEffect(() => {
    if (securityGateFlow.current && session === "unlocked") {
      suppressAutoLockUntil.current = Date.now() + CALCULATOR_GATE_TRANSITION_MS;
      calculatorRestoreArmed.current = true;
      setPendingSecurityGate(false);
      setCalculatorFront(false);
      previousSession.current = "unlocked";
      if (unlockTransitionTimer.current !== null) window.clearTimeout(unlockTransitionTimer.current);
      unlockTransitionTimer.current = window.setTimeout(() => { securityGateFlow.current = false; unlockTransitionTimer.current = null; }, CALCULATOR_GATE_TRANSITION_MS);
      return;
    }
    if (calculatorRestoreArmed.current && (previousSession.current === "unlocked" || previousSession.current === "extlocked" || previousSession.current === "wiping") && session === "locked") {
      calculatorRestoreArmed.current = false;
      setCalculatorFront(true);
    }
    previousSession.current = session;
  }, [session]);

  useEffect(() => {
    if (session !== "unlocked" || !vaultMigrationRequired || vault.length === 0) return;
    if (tab !== "files") setTab("files");
    if (!vaultOpen) setVaultOpen(true);
  }, [session, vaultMigrationRequired, vault.length, tab, vaultOpen, setTab, setVaultOpen]);

  useEffect(() => { const root = document.documentElement; root.lang = lang; root.dir = dir; root.dataset.theme = theme; }, [lang, dir, theme]);
  useEffect(() => { void nativeBridge.setScreenCaptureAllowed(!protectedUi); }, [protectedUi]);
  useEffect(() => { if (!toast) return; const id = window.setTimeout(() => setToast(null), 2400); return () => clearTimeout(id); }, [toast, setToast]);

  if (storageFailed || session === "storage-error") return <StorageRecoveryScreen errorCode={storageErrorCode} />;
  if (!ready) return <FakeCalculator onSecretCommand={handleCalculatorCommand} />;
  if (pendingSecurityGate) return <LockGate />;
  if (session === "extlocked") return <ExtendedLockScreen />;
  if (session === "wiping") return <WipeScreen />;
  if (calculatorFront) return <FakeCalculator onSecretCommand={handleCalculatorCommand} />;
  if (openedApp) return <OpenedApp />;
  if (panel === "apps") return <AppsScreen />;
  if (panel === "settings") return <SettingsScreen />;
  if (panel === "pins") return <PinsPanel />;
  if (tab === "files") return <FilesScreen />;
  return <><HomeScreen /><BottomNav /></>;
}
