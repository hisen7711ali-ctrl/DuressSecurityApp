import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { AndroidClock, StatusBar } from "@/components/android-clock";
import { remainingTime } from "@/lib/security-service";
import { PinDots, PinKeypad } from "@/components/pin-keypad";
import { useAppStore } from "@/lib/store";
import { useCopy } from "@/lib/use-copy";

/** Shows the extended app lock as a neutral maintenance screen with an undocumented owner recovery hotspot. */
export function ExtendedLockScreen() {
  const { t, lang } = useCopy();
  const security = useAppStore((s) => s.security);
  const refreshSecurity = useAppStore((s) => s.refreshSecurity);
  const recoverExtendedLock = useAppStore((s) => s.recoverExtendedLock);
  const [now, setNow] = useState(() => Date.now());
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryPin, setRecoveryPin] = useState("");
  const [recoveryError, setRecoveryError] = useState("");

  useEffect(() => {
    const tick = () => {
      setNow(Date.now());
      refreshSecurity();
    };
    const id = window.setInterval(tick, 1000);
    const onVisible = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshSecurity]);

  const r = remainingTime(security, now);
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en-US");
  const cells: [number, string][] = [
    [r.days, t.unitDays],
    [r.hours, t.unitHours],
    [r.minutes, t.unitMinutes],
    [r.seconds, t.unitSeconds],
  ];

  return (
    <div className="bg-mountains flex min-h-svh flex-col select-none">
      <StatusBar />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        <AndroidClock lang={lang} />
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => { setRecoveryOpen(true); setRecoveryError(""); setRecoveryPin(""); }}
          className="absolute left-[15%] top-[3.5rem] z-10 size-20 rounded-full bg-transparent outline-none"
        />
        <span className="grid size-16 place-items-center rounded-full bg-white/10 text-white backdrop-blur">
          <Lock className="size-7" />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-white">{lang === "ar" ? "التطبيق قيد الصيانة" : "App maintenance"}</h1>
          <p className="mt-2 text-sm text-white/70">
            {lang === "ar"
              ? "يعمل التطبيق حالياً على صيانة ذاتية لمعالجة الأخطاء المتراكمة، وفقاً لإجراء صيانة صادر عن الشركة. تستمر الصيانة لمدة 30 يوماً."
              : "The app is performing self-maintenance to address accumulated errors under a company maintenance procedure. The maintenance lasts 30 days."}
          </p>
        </div>
        <div className="w-full rounded-3xl bg-white/10 p-4 backdrop-blur">
          <p className="text-xs text-white/70">{t.extLockEnds}</p>
          <div className="mt-3 grid grid-cols-4 gap-2" dir="ltr">
            {cells.map(([n, label]) => (
              <div key={label} className="rounded-2xl bg-black/25 py-3">
                <p className="text-2xl font-semibold tabular-nums text-white">{nf.format(n)}</p>
                <p className="mt-0.5 text-[11px] text-white/60">{label}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-white/50">
          {lang === "ar" ? "صيانة على مستوى التطبيق · لا تستبدل قفل النظام" : "App-level maintenance · does not replace the system lock"}
        </p>
        {recoveryOpen ? (
          <div className="w-full max-w-sm rounded-2xl border border-white/20 bg-black/35 p-4 backdrop-blur">
            <p className="text-sm font-semibold text-white">{lang === "ar" ? "استرداد الوصول" : "Access recovery"}</p>
            <p className="mt-1 text-xs text-white/70">
              {lang === "ar" ? "أدخل الرمز الرئيسي لاسترداد الوصول إلى التطبيق." : "Enter the master PIN to recover access to the app."}
            </p>
            <div className="mt-4 rounded-xl border border-white/20 bg-black/20 px-4 py-3">
              <PinDots length={recoveryPin.length} />
            </div>
            {recoveryError ? <p className="mt-2 text-center text-xs text-red-300">{recoveryError}</p> : null}
            <div className="mt-3">
              <PinKeypad
                compact
                value={recoveryPin}
                onChange={(next) => { setRecoveryPin(next); setRecoveryError(""); }}
                onConfirm={() => {
                  if (recoveryPin.length !== 4) {
                    setRecoveryError(t.invalidPin);
                    return;
                  }
                  void recoverExtendedLock(recoveryPin).then((recovered) => {
                    if (recovered) {
                      setRecoveryOpen(false);
                      setRecoveryPin("");
                    } else {
                      setRecoveryError(t.wrongPin);
                      setRecoveryPin("");
                    }
                  });
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => { setRecoveryOpen(false); setRecoveryPin(""); setRecoveryError(""); }}
              className="mt-3 h-10 w-full rounded-lg border border-white/20 text-xs text-white/80"
            >
              {t.cancel}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
