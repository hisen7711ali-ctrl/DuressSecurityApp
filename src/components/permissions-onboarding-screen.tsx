import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, CheckCircle2, ExternalLink } from "lucide-react";
import * as nativeBridge from "@/lib/native-bridge";
import { useAppStore } from "@/lib/store";

const INITIAL_PERMISSIONS_DONE_KEY = "duress-security-initial-permissions-v1";

type Row = { id: "overlayPermission" | "usagePermission" | "accessibilityPermission" | "notificationPermission" | "deviceAdmin"; label: string; hint: string; granted: boolean };

export function hasCompletedInitialPermissions(): boolean {
  try { return localStorage.getItem(INITIAL_PERMISSIONS_DONE_KEY) === "1"; } catch { return false; }
}

export function PermissionsOnboardingScreen({ onComplete }: { onComplete: () => void }) {
  const refreshNativePermissions = useAppStore((s) => s.refreshNativePermissions);
  const requestDeviceAdminNative = useAppStore((s) => s.requestDeviceAdminNative);
  const [status, setStatus] = useState(() => useAppStore.getState());
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    await refreshNativePermissions();
    setStatus(useAppStore.getState());
  };

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => { window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus); };
  }, []);

  const rows = useMemo<Row[]>(() => [
    { id: "overlayPermission", label: "الظهور فوق التطبيقات", hint: "ضروري لبوابة الحماية وقفل التطبيقات.", granted: status.overlayPermission },
    { id: "usagePermission", label: "الوصول إلى إحصاءات الاستخدام", hint: "يسمح بمراقبة التطبيق المفتوح عند تفعيل حماية التطبيقات.", granted: status.usagePermission },
    { id: "accessibilityPermission", label: "خدمة إمكانية الوصول", hint: "تُستخدم فقط لتنفيذ حماية التطبيقات المقفلة.", granted: status.accessibilityPermission },
    { id: "notificationPermission", label: "الإشعارات", hint: "مطلوبة للتنبيهات الأمنية عندما يدعمها إصدار Android.", granted: status.notificationPermission },
    { id: "deviceAdmin", label: "مشرف الجهاز", hint: "يسمح بالقفل الفوري للشاشة عند طلبه من التطبيق.", granted: status.deviceAdmin },
  ], [status]);

  const granted = rows.filter((r) => r.granted).length;
  const native = nativeBridge.isNativeAndroid();

  async function grant(row: Row) {
    setBusy(true);
    try {
      if (row.id === "deviceAdmin") await requestDeviceAdminNative();
      else await nativeBridge.requestSystemPermission(row.id);
      await refresh();
    } finally { setBusy(false); }
  }

  function finish() {
    try { localStorage.setItem(INITIAL_PERMISSIONS_DONE_KEY, "1"); } catch { /* non-sensitive onboarding marker */ }
    onComplete();
  }

  if (!native) return null;

  return (
    <main dir="rtl" className="min-h-svh bg-night px-4 py-6 text-white">
      <div className="mx-auto flex min-h-[calc(100svh-3rem)] w-full max-w-md flex-col justify-center gap-5">
        <section className="rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-lift)]">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-cyan/15 p-3"><ShieldCheck className="size-7 text-cyan" /></div>
            <div><h1 className="text-xl font-bold">تهيئة الحماية</h1><p className="mt-1 text-xs text-muted">امنح التطبيق الأذونات المطلوبة قبل بدء الاستخدام.</p></div>
          </div>
          <p className="mt-4 text-sm leading-6 text-muted">تهيئة التشفير وKeystore تعمل في الخلفية منذ تشغيل التطبيق. هذه الشاشة فقط لتجهيز أذونات Android. لا يمكن للتطبيق منح أذونات النظام بنفسه؛ Android يعرض شاشة التأكيد لكل إذن.</p>
          <div className="mt-4 rounded-xl bg-surface-2 p-3 text-center text-sm font-semibold">{granted}/{rows.length} أذونات أساسية مفعّلة</div>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-4">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center justify-between gap-3 border-b border-line py-3 last:border-b-0">
              <div className="min-w-0"><p className="text-sm font-semibold">{row.label}</p><p className="mt-1 text-xs leading-5 text-muted">{row.hint}</p></div>
              {row.granted ? <CheckCircle2 className="size-5 shrink-0 text-success" /> : <button disabled={busy} type="button" onClick={() => void grant(row)} className="flex shrink-0 items-center gap-1 rounded-lg bg-cyan px-3 py-2 text-xs font-bold text-night disabled:opacity-50">منح <ExternalLink className="size-3" /></button>}
            </div>
          ))}
        </section>

        <button type="button" disabled={granted < rows.length || busy} onClick={finish} className="h-12 rounded-xl bg-cyan font-bold text-night disabled:cursor-not-allowed disabled:opacity-40">متابعة إلى الحاسبة</button>
        <p className="text-center text-[11px] leading-5 text-faint">يمكن تغيير هذه الأذونات لاحقًا من إعدادات Android. Device Owner وAutostart ليست أذونات عادية ويمكن أن تتطلب إعداد الجهاز أو الشركة المصنّعة.</p>
      </div>
    </main>
  );
}
