import { useState } from "react";
import { ChevronLeft, Hash, LockKeyhole, ShieldAlert, Trash2 } from "lucide-react";
import { useAppStore, type PinKind } from "@/lib/store";
import { useCopy } from "@/lib/use-copy";
import { copy } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const KINDS: PinKind[] = ["master", "lock", "duress", "format"];

const ICONS: Record<PinKind, typeof LockKeyhole> = {
  master: LockKeyhole,
  duress: ShieldAlert,
  lock: Hash,
  format: Trash2,
};

export function PinsPanel() {
  const { t } = useCopy();
  const [active, setActive] = useState<PinKind>("master");
  const pins = useAppStore((s) => s.pins);
  const maxAttempts = useAppStore((s) => s.maxAttempts);
  const lockTimeoutSec = useAppStore((s) => s.lockTimeoutSec);
  const openOverlay = useAppStore((s) => s.openOverlay);
  const setPanel = useAppStore((s) => s.setPanel);

  const labels: Record<PinKind, { title: string; hint: string }> = {
    master: { title: t.masterPin, hint: t.masterPinHint },
    duress: { title: t.duressPin, hint: t.duressPinHint },
    lock: { title: t.lockPin, hint: t.lockPinHint },
    format: { title: t.formatPin, hint: t.formatPinHint },
  };

  const Icon = ICONS[active];
  const set = pins[active].length === 4;

  return (
    <div className="flex flex-col gap-4 pb-4">
      <header className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={() => setPanel("none")}
          className="grid size-10 place-items-center text-muted"
          aria-label={t.back}
        >
          <ChevronLeft className="size-5 rtl:rotate-180" />
        </button>
        <h1 className="text-lg font-bold">{t.pins}</h1>
        <span className="size-10" />
      </header>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => setActive(kind)}
            className={cn(
              "h-9 shrink-0 rounded-full px-3 text-xs font-semibold transition-colors",
              active === kind ? "bg-cyan text-night" : "bg-surface text-muted",
            )}
          >
            {labels[kind].title}
          </button>
        ))}
      </div>

      <article className="rounded-xl border border-line bg-surface p-4">
        <div className="flex items-center gap-3">
          <span className="grid size-14 place-items-center rounded-full bg-navy text-cyan">
            <Icon className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">{labels[active].title}</h2>
            <p className="mt-1 text-xs text-muted">{labels[active].hint}</p>
            <p className="mt-2 font-mono text-sm tracking-[0.4em] text-cyan">{set ? "••••" : t.noPinsSet}</p>
          </div>
        </div>
      </article>

      <section className="overflow-hidden rounded-xl border border-line bg-surface">
        <Row label={t.pinCharset} value={t.charsHint} />
        <Row label={t.pinType} value={labels[active].title} />
        <Row label={t.pinLength} value={t.fourChars} />
        <Row label={t.attempts} value={`${maxAttempts}`} />
        <Row label={t.lockTimeout} value={`${lockTimeoutSec}s`} last />
      </section>

      <button
        type="button"
        onClick={() => openOverlay({ kind: "set-pin", target: active })}
        className="h-12 w-full rounded-md bg-cyan font-semibold text-night"
      >
        {set ? t.changePin : t.setNow}
      </button>

      <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm leading-relaxed text-muted">{t.pinKeepSafe}</p>
    </div>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 px-4 py-3.5 ${last ? "" : "border-b border-line"}`}>
      <span className="text-sm">{label}</span>
      <span className="text-sm text-muted">{value}</span>
    </div>
  );
}

export function pinKindTitle(lang: "ar" | "en", kind: PinKind) {
  const t = copy[lang];
  const map: Record<PinKind, string> = {
    master: t.masterPin,
    duress: t.duressPin,
    lock: t.lockPin,
    format: t.formatPin,
  };
  return map[kind];
}
