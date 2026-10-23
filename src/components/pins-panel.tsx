import { useEffect, useState } from "react";
import { ChevronLeft, Hash, LockKeyhole, ShieldAlert, Trash2 } from "lucide-react";
import { useAppStore, type PinKind } from "@/lib/store";
import { useCopy } from "@/lib/use-copy";
import { copy } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { loadCalculatorCommand, normalizeCalculatorCommand, setCalculatorCommand } from "@/lib/calculator-command";

const KINDS: PinKind[] = ["master", "lock", "duress", "format"];
const ATTEMPT_OPTIONS = [3, 4, 7, 10] as const;
const LOCKOUT_OPTIONS = [10, 20, 30, 60, 300] as const;

const ICONS: Record<PinKind, typeof LockKeyhole> = { master: LockKeyhole, duress: ShieldAlert, lock: Hash, format: Trash2 };

export function PinsPanel() {
  const { t, lang } = useCopy();
  const [active, setActive] = useState<PinKind>("master");
  const [calculatorCommand, setCalculatorCommandState] = useState("");
  const [masterCheck, setMasterCheck] = useState("");
  const [newCalculatorCommand, setNewCalculatorCommand] = useState("");
  const [calculatorBusy, setCalculatorBusy] = useState(false);
  const pins = useAppStore((s) => s.pins);
  const pinLength = useAppStore((s) => s.pinLength);
  const setPinLength = useAppStore((s) => s.setPinLength);
  const maxAttempts = useAppStore((s) => s.maxAttempts);
  const lockTimeoutSec = useAppStore((s) => s.lockTimeoutSec);
  const openOverlay = useAppStore((s) => s.openOverlay);
  const setPanel = useAppStore((s) => s.setPanel);
  const setToast = useAppStore((s) => s.setToast);

  useEffect(() => {
    let cancelled = false;
    void loadCalculatorCommand().then((value) => {
      if (!cancelled) { setCalculatorCommandState(value); setNewCalculatorCommand(value); }
    });
    return () => { cancelled = true; };
  }, []);

  const labels: Record<PinKind, { title: string; hint: string }> = {
    master: { title: t.masterPin, hint: t.masterPinHint },
    duress: { title: t.duressPin, hint: t.duressPinHint },
    lock: { title: t.lockPin, hint: t.lockPinHint },
    format: { title: t.formatPin, hint: t.formatPinHint },
  };
  const Icon = ICONS[active];
  const set = pins[active].length > 0;
  const lengthMatches = pins[active].length === pinLength;

  function updatePinLength(nextLength: number) {
    if (nextLength !== 4 && nextLength !== 7 && nextLength !== 10) return;
    setPinLength(nextLength);
    setToast(lang === "ar"
      ? "تغيّر الطول المطلوب. الرموز الحالية تبقى صالحة حتى تعيد ضبط كل رمز على حدة؛ لن تتغيّر سرًّا."
      : "Preferred length changed. Existing PINs remain valid until you update each one; no PIN changes silently.");
  }

  async function saveCalculatorCommand() {
    const normalizedMaster = normalizeCalculatorCommand(masterCheck);
    const normalizedNew = normalizeCalculatorCommand(newCalculatorCommand);
    if (normalizedMaster !== normalizeCalculatorCommand(pins.master)) { setToast(lang === "ar" ? "رمز المالك غير صحيح." : "The master PIN is incorrect."); return; }
    if (!/^\d{8}$/.test(normalizedNew)) { setToast(lang === "ar" ? "رمز الحاسبة يجب أن يتكون من 8 أرقام." : "The calculator command must contain exactly 8 digits."); return; }
    const securityPins = Object.values(pins).map(normalizeCalculatorCommand);
    if (securityPins.includes(normalizedNew)) { setToast(lang === "ar" ? "لا تستخدم رمزاً مطابقاً لأحد رموز الحماية الأربعة." : "Do not reuse one of the four security PINs."); return; }
    setCalculatorBusy(true);
    const saved = await setCalculatorCommand(normalizedNew);
    setCalculatorBusy(false);
    if (!saved) { setToast(lang === "ar" ? "تعذّر حفظ رمز الحاسبة في التخزين الآمن." : "The calculator command could not be saved to secure storage."); return; }
    setCalculatorCommandState(normalizedNew); setMasterCheck("");
    setToast(lang === "ar" ? "تم تغيير رمز فتح الحاسبة، والرمز القديم لم يعد صالحاً." : "The calculator command was changed; the old command is no longer valid.");
  }

  function updateAttempts(value: number) {
    useAppStore.setState({ maxAttempts: value });
    setToast(lang === "ar" ? `تم ضبط الحد إلى ${value} محاولات.` : `Attempt limit set to ${value}.`);
  }
  function updateLockout(value: number) {
    useAppStore.setState({ lockTimeoutSec: value });
    setToast(lang === "ar" ? `تم ضبط مهلة الانتظار إلى ${value} ثانية.` : `Lockout delay set to ${value} seconds.`);
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      <header className="flex items-center justify-between pt-2">
        <button type="button" onClick={() => setPanel("none")} className="grid size-10 place-items-center text-muted" aria-label={t.back}><ChevronLeft className="size-5 rtl:rotate-180" /></button>
        <h1 className="text-lg font-bold">{t.pins}</h1><span className="size-10" />
      </header>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {KINDS.map((kind) => <button key={kind} type="button" onClick={() => setActive(kind)} className={cn("h-9 shrink-0 rounded-full px-3 text-xs font-semibold transition-colors", active === kind ? "bg-cyan text-night" : "bg-surface text-muted")}>{labels[kind].title}</button>)}
      </div>

      <article className="rounded-xl border border-line bg-surface p-4">
        <div className="flex items-center gap-3">
          <span className="grid size-14 place-items-center rounded-full bg-navy text-cyan"><Icon className="size-6" /></span>
          <div className="min-w-0 flex-1"><h2 className="font-semibold">{labels[active].title}</h2><p className="mt-1 text-xs text-muted">{labels[active].hint}</p><p className="mt-2 font-mono text-sm tracking-[0.4em] text-cyan">{lengthMatches ? "•".repeat(pinLength) : set ? (lang === "ar" ? "الرمز مضبوط على " + pins[active].length + " أرقام" : "Current length: " + pins[active].length) : t.noPinsSet}</p></div>
        </div>
      </article>

      <section className="overflow-hidden rounded-xl border border-line bg-surface">
        <Row label={t.pinCharset} value={t.charsHint} />
        <Row label={t.pinType} value={labels[active].title} />
        <Row label={t.pinLength} value={String(pinLength)} />
        <Row label={t.attempts} value={`${maxAttempts}`} />
        <Row label={t.lockTimeout} value={`${lockTimeoutSec}s`} last />
      </section>

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold text-cyan">{lang === "ar" ? "طول رموز الحماية" : "Security PIN length"}</h2>
        <p className="mt-2 text-xs leading-5 text-muted">{lang === "ar" ? "اختر ٤ أو ٧ أو ١٠ أرقام. الرمز الحالي لا يتغير تلقائيًا؛ استخدم «تغيير الرمز» لكل رمز حتى لا تفقد الوصول." : "Choose 4, 7, or 10 digits. Existing PINs do not change automatically; use Change PIN for each one to avoid losing access."}</p>
        <label className="mt-3 block text-xs text-muted">{lang === "ar" ? "عدد الأرقام" : "Number of digits"}
          <select value={pinLength} onChange={(event) => updatePinLength(Number(event.target.value))} className="mt-1 h-11 w-full rounded-md bg-navy px-3 text-sm text-ink">
            {[4, 7, 10].map((length) => <option key={length} value={length}>{length}</option>)}
          </select>
        </label>
        {!lengthMatches && set ? <p className="mt-2 text-xs text-amber-300">{lang === "ar" ? "هذا الرمز مضبوط حاليًا على " + pins[active].length + " أرقام؛ أعد ضبطه ليطابق الطول المختار." : "This PIN currently has " + pins[active].length + " digits; reconfigure it to match the selected length."}</p> : null}
      </section>

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold text-cyan">{lang === "ar" ? "حدود المحاولات والقفل المؤقت" : "Attempt and temporary-lock limits"}</h2>
        <p className="mt-2 text-xs leading-5 text-muted">{lang === "ar" ? "خيارات محدودة حتى لا تصبح إعدادات الحماية قابلة للضبط إلى قيم ضعيفة." : "Only bounded values are offered so the protection cannot be configured to unsafe extremes."}</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="text-xs text-muted">{lang === "ar" ? "المحاولات" : "Attempts"}
            <select value={maxAttempts} onChange={(e) => updateAttempts(Number(e.target.value))} className="mt-1 h-11 w-full rounded-md bg-navy px-3 text-sm text-ink">
              {ATTEMPT_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className="text-xs text-muted">{lang === "ar" ? "مدة الانتظار" : "Wait time"}
            <select value={lockTimeoutSec} onChange={(e) => updateLockout(Number(e.target.value))} className="mt-1 h-11 w-full rounded-md bg-navy px-3 text-sm text-ink">
              {LOCKOUT_OPTIONS.map((option) => <option key={option} value={option}>{option} {lang === "ar" ? "ث" : "sec"}</option>)}
            </select>
          </label>
        </div>
      </section>

      <button type="button" onClick={() => openOverlay({ kind: "set-pin", target: active })} className="h-12 w-full rounded-md bg-cyan font-semibold text-night">{set ? t.changePin : t.setNow}</button>

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold text-cyan">{lang === "ar" ? "رمز فتح الحاسبة" : "Calculator unlock command"}</h2>
        <p className="mt-2 text-xs leading-relaxed text-muted">{lang === "ar" ? "هذا هو الرمز الذي تدخله من شاشة الحاسبة ثم تضغط = لفتح شاشة الحماية. يتكون من 8 أرقام ويُحفظ في التخزين الآمن. تغيير الرمز يلغي الرمز القديم فوراً." : "This is the 8-digit command entered on the calculator followed by = to open the security gate. It is stored in secure storage, and changing it immediately invalidates the old command."}</p>
        <p className="mt-3 font-mono text-sm tracking-[0.35em] text-cyan">{calculatorCommand ? `${calculatorCommand.slice(0, 2)}••••••` : "••••••••"}</p>
        <label className="mt-4 block text-xs text-muted">{lang === "ar" ? "رمز المالك للتأكيد" : "Master PIN for confirmation"}
          <input inputMode="numeric" type="password" maxLength={10} value={masterCheck} onChange={(event) => setMasterCheck(normalizeCalculatorCommand(event.target.value).replace(/\D/g, "").slice(0, 10))} className="mt-1 h-11 w-full rounded-md border border-line bg-navy px-3 font-mono text-sm tracking-[0.35em] outline-none focus:border-cyan" placeholder="••••" />
        </label>
        <label className="mt-3 block text-xs text-muted">{lang === "ar" ? "الرمز الجديد (8 أرقام)" : "New command (8 digits)"}
          <input inputMode="numeric" type="password" maxLength={8} value={newCalculatorCommand} onChange={(event) => setNewCalculatorCommand(normalizeCalculatorCommand(event.target.value).replace(/\D/g, "").slice(0, 8))} className="mt-1 h-11 w-full rounded-md border border-line bg-navy px-3 font-mono text-sm tracking-[0.35em] outline-none focus:border-cyan" placeholder="••••••••" />
        </label>
        <button type="button" disabled={calculatorBusy} onClick={() => { void saveCalculatorCommand(); }} className="mt-4 h-11 w-full rounded-md bg-cyan font-semibold text-night disabled:cursor-not-allowed disabled:opacity-50">{calculatorBusy ? (lang === "ar" ? "جارٍ الحفظ…" : "Saving…") : (lang === "ar" ? "تغيير رمز الحاسبة" : "Change calculator command")}</button>
      </section>

      <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm leading-relaxed text-muted">{t.pinKeepSafe}</p>
    </div>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return <div className={`flex items-center justify-between gap-3 px-4 py-3.5 ${last ? "" : "border-b border-line"}`}><span className="text-sm">{label}</span><span className="text-sm text-muted">{value}</span></div>;
}

export function pinKindTitle(lang: "ar" | "en", kind: PinKind) {
  const t = copy[lang];
  const map: Record<PinKind, string> = { master: t.masterPin, duress: t.duressPin, lock: t.lockPin, format: t.formatPin };
  return map[kind];
}
