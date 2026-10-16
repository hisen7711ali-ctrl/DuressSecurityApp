import { useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { AndroidClock } from "@/components/android-clock";
import { remainingTime } from "@/lib/security-service";
import { PinDots, PinKeypad } from "@/components/pin-keypad";
import { useAppStore } from "@/lib/store";
import { useCopy } from "@/lib/use-copy";
import { setImmersiveMode } from "@/lib/native-bridge";

/** Shows app-level maintenance with owner PIN recovery and immersive system bars. */
export function ExtendedLockScreen() {
  const { t, lang } = useCopy();
  const security = useAppStore((s) => s.security);
  const refreshSecurity = useAppStore((s) => s.refreshSecurity);
  const recoverExtendedLock = useAppStore((s) => s.recoverExtendedLock);
  const lockoutUntil = useAppStore((s) => s.lockoutUntil);
  const [now, setNow] = useState(() => Date.now());
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryPin, setRecoveryPin] = useState("");
  const [recoveryError, setRecoveryError] = useState("");
  const recoveryAttemptRef = useRef(false);

  useEffect(() => {
    void setImmersiveMode(true);
    return () => { void setImmersiveMode(false); };
  }, []);

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

  async function verifyRecoveryPin(pin: string) {
    if (recoveryAttemptRef.current) return;
    if (pin.length !== 4) {
      setRecoveryError(lang === "ar" ? "أدخل كلمة السر المكوّنة من أربعة أرقام." : "Enter the four-digit owner PIN.");
      return;
    }
    recoveryAttemptRef.current = true;
    try {
      const recovered = await recoverExtendedLock(pin);
      if (recovered) {
        setRecoveryOpen(false);
        setRecoveryPin("");
        setRecoveryError("");
      } else {
        const current = useAppStore.getState();
        if (current.lockoutUntil > Date.now()) {
          const seconds = Math.ceil((current.lockoutUntil - Date.now()) / 1000);
          setRecoveryError(lang === "ar"
            ? `محاولات كثيرة. انتظر ${seconds} ثانية قبل المحاولة مجددًا.`
            : `Too many attempts. Wait ${seconds} seconds before trying again.`);
        } else {
          setRecoveryError(lang === "ar" ? "كلمة السر غير صحيحة أو تعذّر حفظ الاسترداد." : "Incorrect PIN or recovery could not be saved.");
        }
        setRecoveryPin("");
      }
    } finally {
      recoveryAttemptRef.current = false;
    }
  }

  const openRecovery = () => {
    setRecoveryOpen(true);
    setRecoveryError("");
    setRecoveryPin("");
  };

  const recoveryBlockedSeconds = Math.max(0, Math.ceil((lockoutUntil - now) / 1000));
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
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        <AndroidClock lang={lang} />
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={openRecovery}
          aria-label={lang === "ar" ? "استرداد الوصول من وضع الصيانة" : "Recover access from maintenance"}
          className="absolute left-[15%] top-[3.5rem] z-10 size-20 rounded-full bg-transparent outline-none"
        />
        <span className="grid size-16 place-items-center rounded-full bg-white/10 text-white backdrop-blur">
          <Lock className="size-7" />
        </span>
        <div>
          <button
            type="button"
            onClick={openRecovery}
            className="text-2xl font-bold text-white outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-cyan"
            aria-label={lang === "ar" ? "اضغط لإلغاء وضع الصيانة" : "Tap to exit maintenance"}
          >
            {lang === "ar" ? "التطبيق قيد الصيانة" : "App maintenance"}
          </button>
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
            <p className="text-sm font-semibold text-white">{lang === "ar" ? "إلغاء وضع الصيانة" : "Exit maintenance"}</p>
            <p className="mt-1 text-xs text-white/70">
              {lang === "ar" ? "ضع كلمة السر لإلغاء وضع الصيانة." : "Enter the owner PIN to cancel maintenance mode."}
            </p>
            <div className="mt-4 rounded-xl border border-white/20 bg-black/20 px-4 py-3">
              <PinDots length={recoveryPin.length} />
            </div>
            {recoveryBlockedSeconds > 0 ? (
              <p className="mt-2 text-center text-xs text-red-300">
                {lang === "ar" ? `محاولات كثيرة. انتظر ${recoveryBlockedSeconds} ثانية.` : `Too many attempts. Wait ${recoveryBlockedSeconds} seconds.`}
              </p>
            ) : recoveryError ? <p className="mt-2 text-center text-xs text-red-300">{recoveryError}</p> : null}
            <div className="mt-3">
              <PinKeypad
                compact
                disabled={recoveryBlockedSeconds > 0}
                value={recoveryPin}
                onChange={(next) => {
                  setRecoveryPin(next);
                  setRecoveryError("");
                  if (next.length === 4) window.setTimeout(() => { void verifyRecoveryPin(next); }, 80);
                }}
                onConfirm={() => { void verifyRecoveryPin(recoveryPin); }}
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
