import { useEffect, useState } from "react";
import { Fingerprint } from "lucide-react";
import { findApp } from "@/lib/apps";
import { AppGlyph } from "@/components/app-icon";
import { AndroidClock, StatusBar } from "@/components/android-clock";
import { PinDots, PinKeypad } from "@/components/pin-keypad";
import { QuotesBanner } from "@/components/quotes-banner";
import { ShieldMark } from "@/components/shield-mark";
import { pinKindTitle } from "@/components/pins-panel";
import { appName, useAppStore } from "@/lib/store";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";
import { normalizePin } from "@/lib/security-service";
import { recordFailedAttempt, recordSuccessfulMainUnlock } from "@/lib/security-audit";
import { isNativeAndroid } from "@/lib/native-bridge";

const TYPABLE = new Set(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "أ", "ي", "ع"]);

export function LockGate() {
  const { t, lang } = useCopy();
  const overlay = useAppStore((s) => s.overlay);
  const session = useAppStore((s) => s.session);
  const installedApps = useAppStore((s) => s.installedApps);
  const mainLockBackgroundImage = useAppStore((s) => s.mainLockBackgroundImage);
  const mainLockBackgroundScale = useAppStore((s) => s.mainLockBackgroundScale);
  const mainLockBackgroundX = useAppStore((s) => s.mainLockBackgroundX);
  const mainLockBackgroundY = useAppStore((s) => s.mainLockBackgroundY);
  const submitPin = useAppStore((s) => s.submitPin);
  const configuredPins = useAppStore((s) => s.pins);
  const pinLength = useAppStore((s) => s.pinLength);
  const maxPinLength = Math.min(10, Math.max(pinLength, ...Object.values(configuredPins).map((pin) => normalizePin(pin).length)));
  const closeOverlay = useAppStore((s) => s.closeOverlay);
  const failedAttempts = useAppStore((s) => s.failedAttempts);
  const lockoutUntil = useAppStore((s) => s.lockoutUntil);
  const maxAttempts = useAppStore((s) => s.maxAttempts);
  const lockTimeoutSec = useAppStore((s) => s.lockTimeoutSec);
  const setToast = useAppStore((s) => s.setToast);
  const biometricEnabled = useAppStore((s) => s.biometricEnabled);
  const tryBiometricUnlock = useAppStore((s) => s.tryBiometricUnlock);
  const [value, setValue] = useState("");
  const [shake, setShake] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setValue("");
  }, [overlay?.kind, overlay && "action" in overlay ? overlay.action.type : "", overlay && "target" in overlay ? overlay.target : ""]);

  useEffect(() => {
    if (lockoutUntil <= Date.now()) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [lockoutUntil]);

  const remaining = Math.max(0, Math.ceil((lockoutUntil - now) / 1000));
  const lockedOut = remaining > 0;

  function matchesExistingPin(candidate: string): boolean {
    const normalized = normalizePin(candidate);
    return Object.values(useAppStore.getState().pins).some((configured) => normalizePin(configured) === normalized);
  }

  function shouldAutoSubmit(candidate: string): boolean {
    if (overlay?.kind === "set-pin") return candidate.length === pinLength;
    return candidate.length === pinLength || matchesExistingPin(candidate);
  }

  async function finish(next?: string) {
    const current = overlay;
    const pin = (next ?? value).trim();
    if (pin.length !== pinLength && !(current?.kind !== "set-pin" && matchesExistingPin(pin))) {
      setShake(true);
      window.setTimeout(() => setShake(false), 400);
      setToast(t.invalidPin);
      return;
    }
    // Write a reset marker before opening the main session. The encrypted
    // journal is the restart-safe source of consecutive failed attempts.
    const latestState = useAppStore.getState();
    if (current?.kind === "unlock" && normalizePin(pin) === normalizePin(latestState.pins.master) && isNativeAndroid()) {
      const recorded = await recordSuccessfulMainUnlock();
      if (!recorded) {
        useAppStore.setState({
          ready: true,
          session: "storage-error",
          storageErrorCode: "FAILED_ATTEMPT_HISTORY_WRITE_FAILED",
          overlay: null,
          openedApp: null,
          vaultOpen: false,
          vaultCryptoReady: false,
        });
        setToast(lang === "ar"
          ? "تعذّر حفظ إعادة ضبط عدّاد المحاولات في التخزين المشفّر؛ أُوقف الدخول حفاظًا على الحماية."
          : "Could not save the secure attempt-counter reset; access is paused for safety.");
        return;
      }
    }
    const result = submitPin(pin);
    if (result === "duplicate") {
      setValue("");
      setToast(t.duplicatePin);
      return;
    }
    if (result === "armed-emergency") {
      setValue("");
      setShake(true);
      window.setTimeout(() => setShake(false), 350);
      return;
    }
    if (result === "ok" || result === "duress" || result === "wipe" || result === "extended-lock" || result === "need-master") {
      setValue("");
      if (result === "ok" && current?.kind === "confirm") setToast(t.saved);
      return;
    }
    if (result === "wrong" || result === "lockout") {
      const recorded = await recordFailedAttempt({
        packageName: current?.kind === "app" ? current.packageName : "com.duresssecurity.app",
        context: current?.kind === "app" ? "app" : "main",
        attemptedLength: pin.length,
        attemptNumber: Math.max(1, failedAttempts + 1),
        outcome: result === "lockout" ? "rate-limited" : "rejected",
      });
      if (!recorded && isNativeAndroid()) {
        useAppStore.setState({
          ready: true,
          session: "storage-error",
          storageErrorCode: "FAILED_ATTEMPT_HISTORY_WRITE_FAILED",
          overlay: null,
          openedApp: null,
          vaultOpen: false,
          vaultCryptoReady: false,
        });
        setToast(lang === "ar"
          ? "تعذّر حفظ المحاولة الفاشلة في التخزين المشفّر؛ أُوقف الدخول حفاظًا على الحماية."
          : "Could not save the failed attempt securely; access is paused for safety.");
        return;
      }
    }
    setValue("");
    setShake(true);
    window.setTimeout(() => setShake(false), 450);
    if (result === "lockout") setToast(`${t.lockout} ${lockTimeoutSec}s`);
    else setToast(`${t.wrongPin} · ${t.attemptOf} ${failedAttempts + 1} ${t.of} ${maxAttempts}`);
  }

  function typeChar(ch: string) {
    if (lockedOut) return;
    if (value.length >= maxPinLength) return;
    const next = value + ch;
    setValue(next);
    if (shouldAutoSubmit(next)) window.setTimeout(() => finish(next), 80);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (lockedOut) return;
      if (e.key === "Backspace") {
        e.preventDefault();
        setValue((v) => v.slice(0, -1));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        finish();
        return;
      }
      if (TYPABLE.has(e.key)) {
        e.preventDefault();
        typeChar(e.key);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lockedOut, value]);

  if (!overlay) return null;

  const fullLock = overlay.kind === "unlock" && (session === "locked" || session === "duress");
  const canCancel = overlay.kind === "confirm" || overlay.kind === "set-pin";
  const biometricEligible = biometricEnabled && (overlay.kind === "unlock" || overlay.kind === "app");

  async function onBiometric() {
    const ok = await tryBiometricUnlock();
    if (!ok) setToast(t.nativeOnlyToast);
  }

  let title: string = t.enterPin;
  let hint: string = t.enterPinHint;
  if (overlay.kind === "set-pin") {
    title = t.enterNewPin;
    hint = pinKindTitle(lang, overlay.target);
  } else if (overlay.kind === "confirm") {
    title = overlay.title || t.enterMasterConfirm;
    hint = t.masterPin;
  } else if (overlay.kind === "app") {
    title = t.enterPin;
    hint = `${t.overlayActive} · ${appName(lang, overlay.packageName, installedApps)}`;
  }

  const panel = (
    <div className="w-full max-w-sm">
      {fullLock ? (
        <div className="mb-2 flex flex-col items-center">
          <ShieldMark size={88} />
          <p className="mt-2 text-lg font-bold">{t.welcome}</p>
        </div>
      ) : overlay.kind === "app" ? (
        <div className="mb-4 flex flex-col items-center gap-2">
          <LockedAppMark packageName={overlay.packageName} />
        </div>
      ) : null}
      <h1 className="text-center text-xl font-bold">{title}</h1>
      <p className="mt-1 text-center text-sm text-muted">{hint}</p>
      <p className="mt-1 text-center text-xs text-faint">{t.availableKeys}</p>
      <div className={cn("mt-4 rounded-xl border border-cyan/40 bg-surface px-4 py-4", shake && "pin-shake")}>
        <PinDots length={value.length} max={maxPinLength} shake={shake} />
      </div>
      {lockedOut ? <p className="mt-3 text-center text-sm text-danger">{t.lockout} {remaining}s</p> : null}
      <div className="mt-4">
        <PinKeypad value={value} maxLength={maxPinLength} compact disabled={lockedOut} onChange={(next) => { setValue(next); if (next.length > value.length && shouldAutoSubmit(next)) window.setTimeout(() => finish(next), 80); }} onConfirm={() => finish()} />
      </div>
      {biometricEligible ? <button type="button" onClick={onBiometric} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-md border border-line bg-surface-2 text-sm font-semibold"><Fingerprint className="size-4" /> {t.biometricUnlock}</button> : null}
      {canCancel ? <button type="button" onClick={closeOverlay} className="mt-4 h-11 w-full rounded-md bg-danger text-sm font-semibold">{t.cancel}</button> : null}
    </div>
  );

  if (fullLock) {
    return (
      <div className="relative min-h-svh overflow-hidden select-none bg-mountains">
        {mainLockBackgroundImage ? <img src={mainLockBackgroundImage} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: (50 + mainLockBackgroundX) + "% " + (50 + mainLockBackgroundY) + "%", transform: "scale(" + mainLockBackgroundScale + ")" }} /> : null}
        <div className="absolute inset-0 bg-gradient-to-b from-black/15 via-black/25 to-black/70" />
        <div className="relative z-10 flex min-h-svh flex-col overflow-y-auto"><StatusBar />
        <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-between px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-6">
          <div className="flex flex-col items-center gap-3"><svg viewBox="0 0 16 16" className="size-5 text-white/90" fill="currentColor" aria-hidden><path d="M5 7V5.2A3 3 0 0 1 11 5.2V7h.8A1.2 1.2 0 0 1 13 8.2v4.6A1.2 1.2 0 0 1 11.8 14H4.2A1.2 1.2 0 0 1 3 12.8V8.2A1.2 1.2 0 0 1 4.2 7H5Zm1.3-1.8V7h3.4V5.2a1.7 1.7 0 0 0-3.4 0Z" /></svg><AndroidClock lang={lang} /></div>
          <div className="mt-6 flex w-full flex-col items-center"><p className="text-sm text-white/75">{lockedOut ? `${t.lockout} ${remaining}s` : t.swipeHint}</p><div className={cn("mt-4 mb-6", shake && "pin-shake")}><PinDots length={value.length} max={maxPinLength} shake={shake} /></div><PinKeypad android value={value} maxLength={maxPinLength} disabled={lockedOut} onChange={(next) => { setValue(next); if (next.length > value.length && shouldAutoSubmit(next)) window.setTimeout(() => finish(next), 80); }} onConfirm={() => finish()} />{biometricEligible ? <button type="button" onClick={onBiometric} className="key-press mt-5 grid size-[52px] place-items-center rounded-full bg-white/10 text-white backdrop-blur" aria-label={t.biometricUnlock}><Fingerprint className="size-6" /></button> : null}</div>
          <div className="mt-6 w-full"><QuotesBanner compact /></div>
        </div></div>
      </div>
    );
  }

  if (overlay.kind === "app") return <div className="fixed inset-0 z-50"><AppBackdrop packageName={overlay.packageName} /><div className="absolute inset-0 flex items-end justify-center bg-night/70 p-4 sm:items-center"><div className="w-full max-w-md rounded-xl border border-line bg-navy/95 p-5 shadow-[var(--shadow-lift)]">{panel}</div></div></div>;
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-night/80 p-4 sm:items-center"><div className="w-full max-w-md rounded-xl border border-line bg-navy p-5 shadow-[var(--shadow-lift)]">{panel}</div></div>;
}

function LockedAppMark({ packageName }: { packageName: string }) {
  const installed = useAppStore((s) => s.installedApps);
  const app = findApp(installed, packageName);
  if (!app) return <ShieldMark size={72} />;
  return <div className="relative"><AppGlyph app={app} size={56} /><span className="absolute -bottom-1 -end-1 grid size-6 place-items-center rounded-full bg-navy text-cyan ring-2 ring-navy"><svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor" aria-hidden><path d="M5 7V5.2A3 3 0 0 1 11 5.2V7h.8A1.2 1.2 0 0 1 13 8.2v4.6A1.2 1.2 0 0 1 11.8 14H4.2A1.2 1.2 0 0 1 3 12.8V8.2A1.2 1.2 0 0 1 4.2 7H5Zm1.3-1.8V7h3.4V5.2a1.7 1.7 0 0 0-3.4 0Z" /></svg></span></div>;
}

function AppBackdrop({ packageName }: { packageName: string }) {
  const { lang } = useCopy();
  const installed = useAppStore((s) => s.installedApps);
  const backgroundImage = useAppStore((s) => s.appLockBackgroundImage);
  const backgroundScale = useAppStore((s) => s.appLockBackgroundScale);
  const backgroundX = useAppStore((s) => s.appLockBackgroundX);
  const backgroundY = useAppStore((s) => s.appLockBackgroundY);
  const app = findApp(installed, packageName);
  const name = app ? (lang === "ar" ? app.nameAr : app.nameEn) : packageName;
  return <div className="app-lock-backdrop relative flex h-full flex-col overflow-hidden bg-navy">{backgroundImage ? <img src={backgroundImage} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: (50 + backgroundX) + "% " + (50 + backgroundY) + "%", transform: "scale(" + backgroundScale + ")" }} /> : null}<div className="absolute inset-0 bg-navy/60" /><header className="relative z-10 flex items-center gap-3 px-4 py-4" style={{ background: app?.accent ? app.accent + "cc" : "var(--color-surface)" }}>{app ? <AppGlyph app={app} size={36} /> : null}<div><p className="text-sm font-semibold text-paper">{name}</p><p className="text-[11px] text-paper/70">{lang === "ar" ? "التطبيق محمي" : "App protected"}</p></div></header><div className="relative z-10 flex flex-1 flex-col gap-3 px-5 py-6 opacity-60"><div className="h-10 w-2/3 rounded-2xl bg-surface" /><div className="ms-auto h-10 w-1/2 rounded-2xl bg-surface-2" /><div className="h-16 w-3/4 rounded-2xl bg-surface" /><div className="ms-auto h-10 w-2/5 rounded-2xl bg-surface-2" /></div></div>;
}
