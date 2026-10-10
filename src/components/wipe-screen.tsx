import { useCallback, useEffect, useState } from "react";
import { ShieldMark } from "@/components/shield-mark";
import { wipeAppData } from "@/lib/security-service";
import { useAppStore } from "@/lib/store";
import { isNativeAndroid, secureStorageClearOwned } from "@/lib/native-bridge";
import { useCopy } from "@/lib/use-copy";

export function WipeScreen() {
  const { t, lang } = useCopy();
  const wipeLocal = useAppStore((s) => s.wipeLocal);
  const lockSession = useAppStore((s) => s.lockSession);
  const [wipeError, setWipeError] = useState(false);

  const performWipe = useCallback(async () => {
    setWipeError(false);
    // In an APK, clear the encrypted native store first. If this fails, do not
    // report success or replace the in-memory state with defaults.
    try {
      if (isNativeAndroid() && !(await secureStorageClearOwned())) {
        setWipeError(true);
        return;
      }
      await wipeAppData();
      wipeLocal();
    } catch {
      setWipeError(true);
    }
  }, [wipeLocal]);

  useEffect(() => {
    // Begin clearing app-owned data immediately; do not show a fake progress delay.
    void performWipe();
  }, [performWipe]);

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-night px-6 text-center">
      <ShieldMark size={88} />
      <h1 className="mt-6 text-2xl font-bold">{t.wipeTitle}</h1>
      <p className="mt-2 max-w-sm text-sm text-muted">{wipeError
        ? (lang === "ar" ? "تعذر مسح التخزين الآمن؛ لم يتم تأكيد التصفير. أعد المحاولة أو ارجع لشاشة الدخول." : "Secure storage could not be cleared; reset was not confirmed. Retry or return to the app lock.")
        : t.wipeBody}</p>
      {wipeError ? (
        <div className="mt-5 flex w-full max-w-sm gap-3">
          <button type="button" onClick={() => { void performWipe(); }} className="h-11 flex-1 rounded-lg bg-cyan px-4 text-sm font-semibold text-night">
            {lang === "ar" ? "إعادة المحاولة" : "Retry"}
          </button>
          <button type="button" onClick={lockSession} className="h-11 flex-1 rounded-lg border border-line px-4 text-sm text-ink">
            {lang === "ar" ? "العودة" : "Return"}
          </button>
        </div>
      ) : null}
      {!wipeError ? <div className="mt-8 h-1.5 w-48 overflow-hidden rounded-full bg-surface">
        <div className="h-full w-full origin-right animate-pulse bg-cyan" />
      </div> : null}
    </div>
  );
}
