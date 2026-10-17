import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, House, LockKeyhole, ShieldCheck, Smartphone } from "lucide-react";
import { AppGlyph } from "@/components/app-icon";
import { APP_SUGGESTIONS, appLabel, hashAccent, type DeviceApp } from "@/lib/apps";
import { useAppStore } from "@/lib/store";
import { useCopy } from "@/lib/use-copy";
import { isNativeAndroid, launchKioskApp, listLaunchableApps, setKioskMode } from "@/lib/native-bridge";

export function KioskScreen() {
  const { t, lang } = useCopy();
  const native = isNativeAndroid();
  const installedApps = useAppStore((s) => s.installedApps);
  const allowedPackages = useAppStore((s) => s.kioskAllowedPackages);
  const setAllowedPackages = useAppStore((s) => s.setKioskAllowedPackages);
  const setPanel = useAppStore((s) => s.setPanel);
  const setToast = useAppStore((s) => s.setToast);
  const openOverlay = useAppStore((s) => s.openOverlay);
  const deviceOwner = useAppStore((s) => s.deviceOwner);
  const kioskEnabled = useAppStore((s) => s.dedicatedDeviceMode);
  const refreshNativePermissions = useAppStore((s) => s.refreshNativePermissions);
  const [deviceApps, setDeviceApps] = useState<DeviceApp[]>([]);
  const [previewApp, setPreviewApp] = useState<DeviceApp | null>(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    let active = true;
    const loadApps = async () => {
      setScanning(true);
      try {
        if (!native) {
          if (active) setDeviceApps(installedApps.length ? installedApps : APP_SUGGESTIONS);
          return;
        }
        const listed = await listLaunchableApps();
        const known = new Map<string, DeviceApp>();
        for (const app of [...APP_SUGGESTIONS, ...installedApps]) known.set(app.packageName, app);
        const mapped = (listed ?? []).map((row) => known.get(row.packageName) ?? ({
          id: row.packageName,
          packageName: row.packageName,
          nameAr: row.label,
          nameEn: row.label,
          accent: hashAccent(row.label),
          icon: "letter" as const,
        }));
        if (active) setDeviceApps(mapped.length ? mapped : (installedApps.length ? installedApps : APP_SUGGESTIONS));
      } finally {
        if (active) setScanning(false);
      }
    };
    void loadApps();
    return () => { active = false; };
  }, [native, installedApps]);

  const candidates = useMemo(
    () => [...(deviceApps.length ? deviceApps : APP_SUGGESTIONS)].sort((a, b) => appLabel(a, lang).localeCompare(appLabel(b, lang), lang)),
    [deviceApps, lang],
  );
  const allowedApps = useMemo(
    () => candidates.filter((app) => allowedPackages.includes(app.packageName)),
    [candidates, allowedPackages],
  );

  function toggleAllowed(packageName: string) {
    setAllowedPackages(allowedPackages.includes(packageName)
      ? allowedPackages.filter((entry) => entry !== packageName)
      : [...allowedPackages, packageName]);
  }

  function requestKiosk(value: boolean) {
    if (value && allowedPackages.length === 0) {
      setToast(lang === "ar" ? "اختر تطبيقًا مسموحًا واحدًا على الأقل قبل التفعيل." : "Choose at least one allowed app before enabling Kiosk.");
      return;
    }
    if (!native) {
      setToast(lang === "ar" ? "المعاينة تعمل هنا؛ القيود الفعلية متاحة في تطبيق Android فقط." : "Preview works here; actual restrictions require the Android app.");
      return;
    }
    if (!deviceOwner) {
      setToast(lang === "ar" ? "يجب تهيئة التطبيق كمالك الجهاز (Device Owner) أولًا." : "Provision the app as Device Owner first.");
      return;
    }
    openOverlay({ kind: "confirm", action: { type: "toggle-kiosk", value }, title: t.enterMasterConfirm });
  }

  async function applyAllowlist() {
    if (!native || !deviceOwner || !kioskEnabled) {
      setToast(lang === "ar" ? "فعّل Kiosk بصلاحيات مالك الجهاز أولًا." : "Enable Kiosk with Device Owner first.");
      return;
    }
    const ok = await setKioskMode(true, allowedPackages);
    await refreshNativePermissions();
    setToast(ok
      ? (lang === "ar" ? "تم تطبيق قائمة السماح على Android." : "The allowlist was applied to Android.")
      : (lang === "ar" ? "لم يؤكد Android تطبيق القائمة." : "Android did not confirm the allowlist update."));
  }

  async function openLauncherApp(app: DeviceApp) {
    if (native && deviceOwner && kioskEnabled) {
      if (!allowedPackages.includes(app.packageName)) {
        setToast(lang === "ar" ? "هذا التطبيق غير موجود في قائمة السماح." : "This app is not on the allowlist.");
        return;
      }
      const opened = await launchKioskApp(app.packageName);
      if (!opened) setToast(lang === "ar" ? "لم يسمح Android بفتح التطبيق ضمن Kiosk." : "Android did not allow this app to launch within Kiosk.");
      return;
    }
    setPreviewApp(app);
  }

  return (
    <div className="min-h-svh bg-gradient-to-b from-[#06101e] via-[#0b1930] to-[#102943] px-4 pb-6 pt-[max(1rem,env(safe-area-inset-top))] text-white">
      <header className="mx-auto flex w-full max-w-3xl items-center gap-3">
        <button type="button" aria-label={lang === "ar" ? "رجوع" : "Back"} onClick={() => { setPreviewApp(null); setPanel("none"); }} className="grid size-10 place-items-center rounded-xl border border-white/15 bg-white/5">
          <ArrowLeft className="size-4" />
        </button>
        <div className="grid size-11 place-items-center rounded-xl bg-cyan/15 text-cyan"><Smartphone className="size-5" /></div>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold">{lang === "ar" ? "بيئة Kiosk المستقلة" : "Standalone Kiosk"}</h1>
          <p className="text-xs text-white/60">{lang === "ar" ? "واجهة وإعدادات منفصلة عن قفل الشاشة" : "An interface and settings independent from the lock screen"}</p>
        </div>
        <span className={"rounded-full px-3 py-1 text-[11px] " + (deviceOwner && kioskEnabled ? "bg-emerald-500/15 text-emerald-200" : "bg-white/10 text-white/65")}>
          {deviceOwner && kioskEnabled ? (lang === "ar" ? "مفعّل" : "Active") : (lang === "ar" ? "معاينة" : "Preview")}
        </span>
      </header>

      <div className="mx-auto mt-5 grid w-full max-w-3xl gap-5 lg:grid-cols-[280px_1fr]">
        <div className="mx-auto w-full max-w-[280px]">
          <div className="relative aspect-[9/19] overflow-hidden rounded-[2.4rem] border-[6px] border-slate-700 bg-[radial-gradient(circle_at_top,_#28547c,_#0b1528_65%)] shadow-2xl">
            <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-6 pt-4 text-[10px] text-white/80"><span>9:41</span><span>● ● ▰</span></div>
            {previewApp ? (
              <div className="relative z-10 flex h-full flex-col px-4 pb-7 pt-14">
                <button type="button" onClick={() => setPreviewApp(null)} className="mb-5 flex items-center gap-2 self-start rounded-full bg-white/10 px-3 py-2 text-xs"><ArrowLeft className="size-3" />{lang === "ar" ? "الرئيسية" : "Home"}</button>
                <div className="flex flex-col items-center rounded-2xl border border-white/10 bg-black/15 px-3 py-6 text-center">
                  <div className="grid size-16 place-items-center rounded-2xl" style={{ background: previewApp.accent }}><AppGlyph app={previewApp} size={36} /></div>
                  <h2 className="mt-3 font-semibold">{appLabel(previewApp, lang)}</h2>
                  <p className="mt-2 text-xs leading-5 text-white/65">{lang === "ar" ? "هذه معاينة تجريبية فقط، وليست بيانات التطبيق الحقيقي." : "This is a demo preview, not real app data."}</p>
                </div>
                <div className="mt-5 space-y-3 opacity-60"><div className="h-9 rounded-xl bg-white/10" /><div className="h-9 w-4/5 rounded-xl bg-white/10" /><div className="h-20 rounded-xl bg-white/10" /></div>
              </div>
            ) : (
              <div className="relative z-10 flex h-full flex-col px-4 pb-7 pt-14">
                <div className="mb-5 text-center"><p className="text-xl font-semibold">9:41</p><p className="mt-1 text-[10px] text-white/55">{lang === "ar" ? "التطبيقات المسموحة" : "Allowed apps"}</p></div>
                <div className="grid grid-cols-3 gap-x-2 gap-y-4">
                  {allowedApps.slice(0, 12).map((app) => (
                    <button key={app.packageName} type="button" onClick={() => void openLauncherApp(app)} className="flex min-w-0 flex-col items-center gap-1.5 text-center">
                      <span className="grid size-12 place-items-center rounded-2xl shadow-lg" style={{ background: app.accent }}><AppGlyph app={app} size={28} /></span>
                      <span className="line-clamp-2 w-full text-[10px] leading-4">{appLabel(app, lang)}</span>
                    </button>
                  ))}
                </div>
                {allowedApps.length === 0 ? <p className="mt-5 text-center text-xs leading-5 text-white/60">{lang === "ar" ? "اختر التطبيقات المسموحة من القائمة." : "Choose allowed apps from the list."}</p> : null}
                <div className="mt-auto flex justify-center pt-3"><span className="h-1 w-20 rounded-full bg-white/60" /></div>
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center pb-2"><span className="h-1 w-20 rounded-full bg-white/45" /></div>
          </div>
          <p className="mt-3 text-center text-[11px] leading-5 text-white/55">{lang === "ar" ? "معاينة مرئية؛ قيود النظام تحتاج تهيئة Device Owner وتفعيل Kiosk." : "Visual preview; system enforcement requires Device Owner provisioning and Kiosk activation."}</p>
        </div>

        <div className="space-y-4">
          <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-2"><ShieldCheck className="size-4 text-cyan" /><h2 className="font-semibold">{lang === "ar" ? "إدارة البيئة" : "Environment controls"}</h2></div>
            <p className="mt-2 text-xs leading-5 text-white/60">{lang === "ar" ? "اختر التطبيقات المسموحة. التفعيل يحدّث قائمة Lock Task بعد تأكيد المالك." : "Choose the apps that may run. Activation updates Android Lock Task packages after owner confirmation."}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => requestKiosk(true)} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-cyan text-xs font-semibold text-slate-950"><LockKeyhole className="size-4" />{lang === "ar" ? "تفعيل Kiosk" : "Enable Kiosk"}</button>
              <button type="button" onClick={() => requestKiosk(false)} disabled={!kioskEnabled} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-white/15 text-xs font-semibold disabled:opacity-40"><House className="size-4" />{lang === "ar" ? "إيقاف Kiosk" : "Disable Kiosk"}</button>
            </div>
            {!deviceOwner ? <p className="mt-3 text-xs leading-5 text-amber-200">{lang === "ar" ? "مالك الجهاز غير مفعّل؛ لن يتم تجاوز صلاحيات Android." : "Device Owner is not active; Android restrictions will not be bypassed."}</p> : null}
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">{lang === "ar" ? "التطبيقات المسموحة" : "Allowed apps"}</h2><span className="rounded-full bg-white/10 px-2 py-1 text-[11px]">{allowedPackages.length}</span></div>
            <p className="mt-2 text-xs text-white/55">{scanning ? (lang === "ar" ? "جارٍ فحص التطبيقات..." : "Scanning apps...") : (lang === "ar" ? "ضع علامة على التطبيقات التي تظهر في شاشة الهاتف." : "Select apps to display on the phone launcher.")}</p>
            <div className="mt-3 max-h-[340px] space-y-2 overflow-auto pr-1">
              {candidates.map((app) => {
                const checked = allowedPackages.includes(app.packageName);
                return (
                  <button key={app.packageName} type="button" aria-pressed={checked} onClick={() => toggleAllowed(app.packageName)} className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-black/10 p-3 text-start">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl" style={{ background: app.accent }}><AppGlyph app={app} size={24} /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{appLabel(app, lang)}</span><span className="block truncate text-[10px] text-white/45">{app.packageName}</span></span>
                    <span className={"grid size-6 place-items-center rounded-full border " + (checked ? "border-cyan bg-cyan text-slate-950" : "border-white/25 text-transparent")}>
                      {checked ? <Check className="size-4" /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
            {kioskEnabled && deviceOwner ? <button type="button" onClick={() => void applyAllowlist()} className="mt-3 h-10 w-full rounded-lg border border-cyan/50 bg-cyan/10 text-xs font-semibold text-cyan">{lang === "ar" ? "تطبيق القائمة على Android" : "Apply allowlist to Android"}</button> : null}
            <button type="button" onClick={() => setPanel("none")} className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-white/15 text-xs"><ArrowLeft className="size-3" />{lang === "ar" ? "الرجوع للإعدادات" : "Back to settings"}</button>
          </section>
        </div>
      </div>
    </div>
  );
}
