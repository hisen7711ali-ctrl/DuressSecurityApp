import { findApp } from "@/lib/apps";
import { AppGlyph } from "@/components/app-icon";
import { useAppStore } from "@/lib/store";
import { useCopy } from "@/lib/use-copy";

export function OpenedApp() {
  const { t, lang } = useCopy();
  const openedApp = useAppStore((s) => s.openedApp);
  const installedApps = useAppStore((s) => s.installedApps);
  const closeApp = useAppStore((s) => s.closeApp);
  const app = openedApp ? findApp(installedApps, openedApp) : undefined;
  if (!app) return null;
  const name = lang === "ar" ? app.nameAr : app.nameEn;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-navy">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-3">
          <AppGlyph app={app} size={36} />
          <div>
            <p className="text-sm font-semibold">{name}</p>
            <p className="text-xs text-success">{t.appUnlocked}</p>
          </div>
        </div>
        <button type="button" onClick={closeApp} className="h-10 rounded-md px-3 text-sm font-semibold text-cyan">
          {t.closeApp}
        </button>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <AppGlyph app={app} size={64} />
        <p className="text-lg font-bold">{name}</p>
        <p className="max-w-xs text-sm text-muted">{t.overlayActive}</p>
      </div>
    </div>
  );
}
