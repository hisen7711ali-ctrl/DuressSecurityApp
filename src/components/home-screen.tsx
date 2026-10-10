import type { ReactNode } from "react";
import { FolderLock, Grid2x2, Hash, Settings2, ShieldCheck } from "lucide-react";
import { QuotesBanner } from "@/components/quotes-banner";
import { ShieldMark } from "@/components/shield-mark";
import { useAppStore } from "@/lib/store";
import { useCopy } from "@/lib/use-copy";
import { formatRelative } from "@/lib/utils";

export function HomeScreen() {
  const { t, lang } = useCopy();
  const lockedPackages = useAppStore((s) => s.lockedPackages);
  const lastCheckAt = useAppStore((s) => s.lastCheckAt);
  const pins = useAppStore((s) => s.pins);
  const setTab = useAppStore((s) => s.setTab);
  const setPanel = useAppStore((s) => s.setPanel);
  const pinCount = Object.values(pins).filter((p) => p.length === 4).length;

  return (
    <div className="flex flex-col gap-4 pb-4">
      <header className="flex items-center gap-3 pt-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold tracking-tight">{t.appName}</h1>
          <p className="text-xs text-muted">{t.tagline}</p>
        </div>
        <span className="grid size-11 shrink-0 place-items-center rounded-lg border border-line bg-surface text-cyan">
          <ShieldCheck className="size-5" />
        </span>
      </header>

      <section className="flex flex-col items-center pt-2">
        <ShieldMark size={118} />
        <h2 className="mt-3 text-2xl font-bold">{t.welcome}</h2>
        <p className="text-sm text-muted">{t.tagline}</p>
      </section>

      <div className="flex items-center gap-3 rounded-xl bg-success-bg px-4 py-3 text-success">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-success/15">
          <ShieldCheck className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{t.systemProtected}</p>
          <p className="text-xs opacity-80">{t.layersLocked}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label={t.lockedApps} value={`${lockedPackages.length}`} hint={t.protectionActive} />
        <StatCard label={t.secretPins} value={`${pinCount}`} hint={`${pinCount} ${t.customPins}`} />
      </div>
      <p className="text-center text-xs text-faint">
        {t.lastCheck}: {formatRelative(lastCheckAt, lang)}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <ActionTile icon={<Grid2x2 className="size-5" />} title={t.appLock} hint={t.appLockHint} onClick={() => setTab("protect")} iconClass="text-cyan" />
        <ActionTile icon={<Hash className="size-5" />} title={t.pinManage} hint={t.pinManageHint} onClick={() => setPanel("pins")} iconClass="text-cyan" />
        <ActionTile icon={<FolderLock className="size-5" />} title={t.sensitiveFiles} hint={t.sensitiveHint} onClick={() => setTab("files")} iconClass="text-success" />
        <ActionTile icon={<Settings2 className="size-5" />} title={t.flexibleSettings} hint={t.flexibleHint} onClick={() => setTab("settings")} iconClass="text-muted" />
      </div>

      <QuotesBanner />
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-4">
      <p className="text-2xl font-bold tabular-nums text-ink">{value}</p>
      <p className="mt-1 text-sm font-semibold">{label}</p>
      <p className="text-xs text-muted">{hint}</p>
    </div>
  );
}

function ActionTile({
  icon,
  title,
  hint,
  onClick,
  iconClass,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
  iconClass?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-line bg-surface/90 px-4 py-4 text-start transition-colors hover:bg-surface-2"
    >
      <span className={`mb-6 grid size-9 place-items-center rounded-lg bg-navy ${iconClass ?? "text-cyan"}`}>{icon}</span>
      <p className="font-semibold">{title}</p>
      <p className="mt-1 line-clamp-2 text-xs text-muted">{hint}</p>
    </button>
  );
}
