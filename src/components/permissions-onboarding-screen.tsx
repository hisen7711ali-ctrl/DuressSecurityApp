import { useEffect, useMemo, useRef, useState } from "react";
import { ShieldCheck, CheckCircle2, ExternalLink } from "lucide-react";
import * as nativeBridge from "@/lib/native-bridge";
import { useAppStore } from "@/lib/store";

const INITIAL_PERMISSIONS_DONE_KEY = "duress-security-initial-permissions-v1";

type PermissionId = "overlayPermission" | "usagePermission" | "accessibilityPermission" | "notificationPermission" | "deviceAdmin";
type Row = { id: PermissionId; label: string; hint: string; granted: boolean };

export function hasCompletedInitialPermissions(): boolean {
  try { return localStorage.getItem(INITIAL_PERMISSIONS_DONE_KEY) === "1"; } catch { return false; }
}

function buildRows(state: ReturnType<typeof useAppStore.getState>): Row[] {
  const ar = state.lang === "ar";
  return [
    { id: "overlayPermission", label: ar ? "الظهور فوق التطبيقات" : "Display over other apps", hint: ar ? "ضروري لبوابة الحماية وقفل التطبيقات." : "Required for the security gate and app locking.", granted: state.overlayPermission },
    { id: "usagePermission", label: ar ? "الوصول إلى إحصاءات الاستخدام" : "Usage access", hint: ar ? "يسمح بمعرفة التطبيق المفتوح عند تفعيل قفل التطبيقات." : "Lets app locking detect which app is in the foreground.", granted: state.usagePermission },
    { id: "accessibilityPermission", label: ar ? "خدمة إمكانية الوصول" : "Accessibility service", hint: ar ? "تُستخدم فقط لتنفيذ حماية التطبيقات التي تختار قفلها." : "Used only to enforce protection for apps you choose to lock.", granted: state.accessibilityPermission },
    { id: "notificationPermission", label: ar ? "الإشعارات" : "Notifications", hint: ar ? "للتنبيهات الأمنية عندما يتطلبها إصدار أندرويد." : "For security alerts where your Android version requires it.", granted: state.notificationPermission },
    { id: "deviceAdmin", label: ar ? "مشرف الجهاز" : "Device admin", hint: ar ? "يسمح بطلب قفل شاشة الهاتف من داخل التطبيق." : "Allows the app to request an immediate Android screen lock.", granted: state.deviceAdmin },
  ];
}

export function PermissionsOnboardingScreen({ onComplete }: { onComplete: () => void }) {
  const refreshNativePermissions = useAppStore((s) => s.refreshNativePermissions);
  const requestDeviceAdminNative = useAppStore((s) => s.requestDeviceAdminNative);
  const [status, setStatus] = useState(() => useAppStore.getState());
  const [busy, setBusy] = useState(false);
  const [guidedSetup, setGuidedSetup] = useState(false);
  const [setupMessage, setSetupMessage] = useState("");
  const guidedSetupRef = useRef(false);
  const promptedPermissionRef = useRef<PermissionId | null>(null);
  const advancingRef = useRef(false);
  const lang = status.lang === "ar" ? "ar" : "en";
  const ar = lang === "ar";
  const rows = useMemo(() => buildRows(status), [status]);
  const granted = rows.filter((r) => r.granted).length;
  const native = nativeBridge.isNativeAndroid();

  async function refresh(fromResume = false) {
    await refreshNativePermissions();
    const current = useAppStore.getState();
    setStatus(current);
    if (!fromResume || !guidedSetupRef.current || !promptedPermissionRef.current || advancingRef.current) return;
    const currentRows = buildRows(current);
    const justRequested = currentRows.find((row) => row.id === promptedPermissionRef.current);
    if (!justRequested?.granted) {
      guidedSetupRef.current = false;
      promptedPermissionRef.current = null;
      setGuidedSetup(false);
      setSetupMessage(current.lang === "ar"
        ? "لم يتم تفعيل الإذن بعد. يمكنك المحاولة مجددًا أو منح الإذن من قائمته."
        : "That permission is still off. Retry guided setup or grant it from its row.");
      return;
    }
    promptedPermissionRef.current = null;
    const next = currentRows.find((row) => !row.granted);
    if (!next) {
      guidedSetupRef.current = false;
      setGuidedSetup(false);
      setSetupMessage(current.lang === "ar" ? "اكتملت تهيئة الصلاحيات المطلوبة." : "Required permissions are set up.");
      return;
    }
    advancingRef.current = true;
    window.setTimeout(() => {
      advancingRef.current = false;
      void grant(next, true);
    }, 450);
  }

  useEffect(() => {
    void refresh();
    const onResume = () => {
      if (document.visibilityState === "visible") void refresh(true);
    };
    window.addEventListener("focus", onResume);
    document.addEventListener("visibilitychange", onResume);
    return () => {
      window.removeEventListener("focus", onResume);
      document.removeEventListener("visibilitychange", onResume);
    };
  }, []);

  async function grant(row: Row, guided = false) {
    setBusy(true);
    setSetupMessage("");
    if (guided) {
      guidedSetupRef.current = true;
      promptedPermissionRef.current = row.id;
    }
    try {
      if (row.id === "deviceAdmin") await requestDeviceAdminNative();
      else await nativeBridge.requestSystemPermission(row.id);
      await refresh();
      // Device Admin uses an Activity result callback, so it can resolve after
      // the permission screen closes. Advance the guided flow if it was granted.
      if (guided && row.id === "deviceAdmin") await refresh(true);
    } finally { setBusy(false); }
  }

  function startGuidedSetup() {
    const currentRows = buildRows(useAppStore.getState());
    const next = currentRows.find((row) => !row.granted);
    if (!next) {
      setSetupMessage(ar ? "كل الأذونات المطلوبة مفعّلة." : "All required permissions are enabled.");
      return;
    }
    guidedSetupRef.current = true;
    setGuidedSetup(true);
    setSetupMessage(ar
      ? "افتح شاشة الإذن ووافق عليها ثم ارجع؛ سيُفتح الإذن التالي تلقائيًا. أندرويد سيطلب موافقتك لكل إذن."
      : "Approve each Android permission screen and return; the next missing permission will open automatically.");
    void grant(next, true);
  }

  function finish() {
    try { localStorage.setItem(INITIAL_PERMISSIONS_DONE_KEY, "1"); } catch { /* non-sensitive onboarding marker */ }
    guidedSetupRef.current = false;
    promptedPermissionRef.current = null;
    onComplete();
  }

  if (!native) return null;

  return (
    <main dir={ar ? "rtl" : "ltr"} className="min-h-svh bg-night px-4 py-6 text-white">
      <div className="mx-auto flex min-h-[calc(100svh-3rem)] w-full max-w-md flex-col justify-center gap-5">
        <section className="rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-lift)]">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-cyan/15 p-3"><ShieldCheck className="size-7 text-cyan" /></div>
            <div>
              <h1 className="text-xl font-bold">{ar ? "تهيئة الحماية" : "Security setup"}</h1>
              <p className="mt-1 text-xs text-muted">{ar ? "جهّز أذونات أندرويد المطلوبة قبل بدء الاستخدام." : "Set up the Android permissions required before using protection."}</p>
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-muted">{ar
            ? "تهيئة التشفير وKeystore تعمل في الخلفية. هذه الشاشة لتجهيز أذونات أندرويد فقط. لا يستطيع التطبيق منح أذونات النظام بنفسه؛ يجب تأكيد كل إذن من شاشة أندرويد."
            : "Encryption and Keystore initialization run in the background. This screen only configures Android permissions. The app cannot grant system permissions on its own; each permission must be confirmed in Android."}</p>
          <div className="mt-4 rounded-xl bg-surface-2 p-3 text-center text-sm font-semibold">
            {granted}/{rows.length} {ar ? "أذونات أساسية مفعّلة" : "essential permissions enabled"}
          </div>
        </section>

        <button type="button" disabled={busy || granted === rows.length} onClick={startGuidedSetup} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-cyan px-4 font-bold text-night disabled:opacity-50">
          <ExternalLink className="size-4" />
          {guidedSetup ? (ar ? "تابع تهيئة الأذونات" : "Continue permission setup") : (ar ? "تهيئة الأذونات المطلوبة" : "Set up required permissions")}
        </button>

        <section className="rounded-2xl border border-line bg-surface p-4">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center justify-between gap-3 border-b border-line py-3 last:border-b-0">
              <div className="min-w-0"><p className="text-sm font-semibold">{row.label}</p><p className="mt-1 text-xs leading-5 text-muted">{row.hint}</p></div>
              {row.granted ? <CheckCircle2 className="size-5 shrink-0 text-success" /> : <button disabled={busy} type="button" onClick={() => void grant(row)} className="flex shrink-0 items-center gap-1 rounded-lg bg-cyan px-3 py-2 text-xs font-bold text-night disabled:opacity-50">{ar ? "منح" : "Grant"} <ExternalLink className="size-3" /></button>}
            </div>
          ))}
        </section>
        {setupMessage ? <p aria-live="polite" className="rounded-lg border border-cyan/20 bg-surface p-3 text-sm leading-5 text-muted">{setupMessage}</p> : null}
        <button type="button" disabled={granted < rows.length || busy} onClick={finish} className="h-12 rounded-xl bg-cyan font-bold text-night disabled:cursor-not-allowed disabled:opacity-40">
          {ar ? "متابعة إلى الحاسبة" : "Continue to calculator"}
        </button>
        <p className="text-center text-[11px] leading-5 text-faint">{ar
          ? "يمكنك تغيير الأذونات لاحقًا من إعدادات أندرويد. Device Owner وAutostart ليسا أذونات عادية وقد يتطلبان إعداد الجهاز أو الشركة المصنّعة."
          : "You can change permissions later in Android Settings. Device Owner and Autostart are not ordinary permissions and may require device provisioning or manufacturer-specific settings."}</p>
      </div>
    </main>
  );
}
