import { useMemo, useState, type ReactNode } from "react";
import { Layers, Plus, Search, ShieldOff, Trash2, X } from "lucide-react";
import { AppGlyph } from "@/components/app-icon";
import { APP_SUGGESTIONS, appLabel, hashAccent, makeCustomApp, type DeviceApp } from "@/lib/apps";
import { useAppStore } from "@/lib/store";
import { useCopy } from "@/lib/use-copy";
import { isNativeAndroid, listLaunchableApps } from "@/lib/native-bridge";

export function AppsScreen() {
  const { t, lang } = useCopy();
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [scanning, setScanning] = useState(false);
  const appLockEnabled = useAppStore((s) => s.appLockEnabled);
  const overlayEnabled = useAppStore((s) => s.overlayEnabled);
  const preventUninstall = useAppStore((s) => s.preventUninstall);
  const lockedPackages = useAppStore((s) => s.lockedPackages);
  const installedApps = useAppStore((s) => s.installedApps);
  const overlayPermission = useAppStore((s) => s.overlayPermission);
  const usagePermission = useAppStore((s) => s.usagePermission);
  const accessibilityPermission = useAppStore((s) => s.accessibilityPermission);
  const native = isNativeAndroid();
  const openOverlay = useAppStore((s) => s.openOverlay);
  const toggleLockedApp = useAppStore((s) => s.toggleLockedApp);
  const openApp = useAppStore((s) => s.openApp);
  const addInstalledApp = useAppStore((s) => s.addInstalledApp);
  const syncInstalledApps = useAppStore((s) => s.syncInstalledApps);
  const removeInstalledApp = useAppStore((s) => s.removeInstalledApp);
  const setToast = useAppStore((s) => s.setToast);
  const setTab = useAppStore((s) => s.setTab);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return installedApps;
    return installedApps.filter((a) => `${a.nameAr} ${a.nameEn} ${a.packageName}`.toLowerCase().includes(q));
  }, [installedApps, query]);

  const suggestionHits = useMemo(() => {
    const q = draft.trim().toLowerCase();
    const have = new Set(installedApps.map((a) => a.packageName));
    return APP_SUGGESTIONS.filter((a) => {
      if (have.has(a.packageName)) return false;
      if (!q) return true;
      return `${a.nameAr} ${a.nameEn}`.toLowerCase().includes(q);
    });
  }, [draft, installedApps]);


  async function scanDeviceApps() {
    if (!native) {
      setToast(t.nativeOnlyToast);
      return;
    }
    setScanning(true);
    try {
      const launchable = await listLaunchableApps();
      if (!launchable) {
        setToast(t.scanAppsUnavailable);
        return;
      }
      const mapped: DeviceApp[] = launchable.map(({ packageName, label }) => {
        const known = APP_SUGGESTIONS.find((app) => app.packageName === packageName);
        if (known) return known;
        const existing = installedApps.find((app) => app.packageName === packageName);
        if (existing) return existing;
        return {
          id: `android:${packageName}`,
          packageName,
          nameAr: label,
          nameEn: label,
          accent: hashAccent(packageName),
          icon: "letter",
        };
      });
      syncInstalledApps(mapped);
      setToast(`${t.scanAppsResult} (${mapped.length})`);
    } finally {
      setScanning(false);
    }
  }

  function addFromSuggestion(pkg: (typeof APP_SUGGESTIONS)[number]) {
    const ok = addInstalledApp(pkg);
    setToast(ok ? t.appAdded : t.alreadyAdded);
  }

  function addCustom() {
    const name = draft.trim();
    if (!name) return;
    const ok = addInstalledApp(makeCustomApp(name));
    setToast(ok ? t.appAdded : t.alreadyAdded);
    setDraft("");
  }

  function tryOpen(packageName: string) {
    if (native && appLockEnabled && lockedPackages.includes(packageName) && !accessibilityPermission) {
      setToast(t.needsOverlay);
      setTab("settings");
      return;
    }
    openApp(packageName);
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      <header className="pt-2">
        <h1 className="text-lg font-bold">{t.appLock}</h1>
        <p className="text-sm text-muted">{t.overlayHint}</p>
      </header>

      <ToggleRow
        label={t.enableAppLock}
        on={appLockEnabled}
        onToggle={(value) =>
          openOverlay({
            kind: "confirm",
            action: { type: "toggle-app-lock", value },
            title: t.enterMasterConfirm,
          })
        }
      />

      <div className="grid grid-cols-2 gap-3">
        <FeatureCard
          icon={<Layers className="size-4" />}
          title={t.overlayOn}
          hint={t.overlayCardHint}
          on={overlayEnabled}
          onToggle={() =>
            openOverlay({
              kind: "confirm",
              action: { type: "toggle-overlay", value: !overlayEnabled },
              title: t.enterMasterConfirm,
            })
          }
        />
        <FeatureCard
          icon={<ShieldOff className="size-4" />}
          title={t.preventUninstall}
          hint={t.preventCardHint}
          on={preventUninstall}
          onToggle={() =>
            openOverlay({
              kind: "confirm",
              action: { type: "toggle-prevent", value: !preventUninstall },
              title: t.enterMasterConfirm,
            })
          }
        />
      </div>

      {appLockEnabled && native && !accessibilityPermission ? (
        <button
          type="button"
          onClick={() => setTab("settings")}
          className="rounded-xl bg-danger-bg px-4 py-3 text-start text-sm text-danger"
        >
          {t.needsOverlay}
        </button>
      ) : null}
      {appLockEnabled && !native && (!overlayPermission || !usagePermission) ? (
        <p className="rounded-xl border border-line bg-surface px-4 py-3 text-start text-xs text-muted">{t.browserLimit}</p>
      ) : null}

      {native ? (
        <button
          type="button"
          disabled={scanning}
          onClick={() => { void scanDeviceApps(); }}
          className="h-10 w-full rounded-lg border border-line bg-surface text-xs font-semibold text-cyan disabled:opacity-50"
        >
          {scanning ? t.scanningApps : t.scanDeviceApps}
        </button>
      ) : null}

      <div className="flex gap-2">
        <label className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3">
          <Search className="size-4 shrink-0 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.searchApps}
            className="w-full bg-transparent text-sm outline-none placeholder:text-faint"
          />
        </label>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="grid size-12 shrink-0 place-items-center rounded-xl bg-cyan text-night"
          aria-label={t.addApp}
        >
          <Plus className="size-5" />
        </button>
      </div>

      <section className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <p className="text-sm font-semibold">{t.yourApps}</p>
          <p className="text-xs text-muted">
            {installedApps.length} · {lockedPackages.length} {t.lockedApps}
          </p>
        </div>
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm font-semibold">{t.noAppsYet}</p>
            <p className="mt-2 text-xs leading-relaxed text-muted">{t.browserLimit}</p>
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="mt-4 h-10 rounded-md bg-cyan px-4 text-sm font-semibold text-night"
            >
              {t.addApp}
            </button>
          </div>
        ) : (
          filtered.map((app, i) => {
            const locked = lockedPackages.includes(app.packageName);
            return (
              <div
                key={app.packageName}
                className={`flex items-center gap-3 px-3 py-2.5 ${i < filtered.length - 1 ? "border-b border-line" : ""}`}
              >
                <button type="button" onClick={() => tryOpen(app.packageName)} className="contents">
                  <AppGlyph app={app} />
                </button>
                <button type="button" onClick={() => tryOpen(app.packageName)} className="min-w-0 flex-1 text-start">
                  <p className="truncate text-sm font-semibold">{appLabel(app, lang)}</p>
                  <p className="truncate text-xs text-faint">{app.packageName}</p>
                </button>
                <button
                  type="button"
                  onClick={() => removeInstalledApp(app.packageName)}
                  className="grid size-9 place-items-center text-muted"
                  aria-label={t.removeApp}
                >
                  <Trash2 className="size-4" />
                </button>
                <Switch checked={locked} disabled={!appLockEnabled} onChange={() => toggleLockedApp(app.packageName)} />
              </div>
            );
          })
        )}
      </section>

      {adding ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-night/70 p-4 sm:items-center">
          <div className="max-h-[85svh] w-full max-w-md overflow-y-auto rounded-xl border border-line bg-navy p-4 shadow-[var(--shadow-lift)]">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">{t.addApp}</h2>
              <button type="button" onClick={() => setAdding(false)} className="grid size-9 place-items-center text-muted" aria-label={t.cancel}>
                <X className="size-4" />
              </button>
            </div>
            <p className="mb-3 text-xs leading-relaxed text-muted">{t.suggestionsHint}</p>
            <div className="flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={t.appNameField}
                className="h-11 min-w-0 flex-1 rounded-md bg-surface px-3 text-sm outline-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter") addCustom();
                }}
              />
              <button type="button" onClick={addCustom} className="h-11 rounded-md bg-cyan px-3 text-sm font-semibold text-night">
                {t.addCustom}
              </button>
            </div>
            <p className="mt-4 mb-2 text-xs font-semibold text-cyan">{t.pickOnDevice}</p>
            <div className="grid grid-cols-3 gap-2">
              {suggestionHits.map((app) => (
                <button
                  key={app.packageName}
                  type="button"
                  onClick={() => addFromSuggestion(app)}
                  className="flex flex-col items-center gap-2 rounded-lg bg-surface px-2 py-3 text-center"
                >
                  <AppGlyph app={app} size={36} />
                  <span className="line-clamp-2 text-xs font-medium">{appLabel(app, lang)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  hint,
  on,
  onToggle,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="grid size-8 place-items-center rounded-md bg-navy text-cyan">{icon}</span>
        <Switch checked={on} onChange={onToggle} />
      </div>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </div>
  );
}

export function ToggleRow({
  label,
  hint,
  on,
  onToggle,
  disabled = false,
}: {
  label: string;
  hint?: string;
  on: boolean;
  onToggle: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 ${disabled ? "opacity-75" : ""}`}>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{label}</p>
        {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      </div>
      <Switch checked={on} disabled={disabled} onChange={() => onToggle(!on)} />
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={`relative h-7 w-12 rounded-full transition-colors ${checked ? "bg-cyan" : "bg-line"} ${disabled ? "opacity-40" : ""}`}
    >
      <span
        className="absolute top-0.5 size-6 rounded-full bg-paper shadow"
        style={{ insetInlineStart: checked ? "22px" : "2px" }}
      />
    </button>
  );
}
