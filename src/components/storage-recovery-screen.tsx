import { useState } from "react";
import { AlertTriangle, ChevronDown, RefreshCw, RotateCcw } from "lucide-react";
import { useCopy } from "@/lib/use-copy";
import * as nativeBridge from "@/lib/native-bridge";

/** Fail-closed recovery when Android Keystore storage is unavailable. */
export function StorageRecoveryScreen({ errorCode }: { errorCode?: string | null }) {
  const { lang } = useCopy();
  const ar = lang === "ar";
  const [resetting, setResetting] = useState(false);
  const retry = () => window.location.reload();
  const resetSecureStorage = async () => {
    const confirmed = window.confirm(ar
      ? "سيتم إعادة تهيئة التخزين الآمن ومفتاح Android Keystore. قد تفقد إعدادات وبيانات الحماية المحفوظة إذا لم توجد نسخة قابلة للاستعادة. هل تريد المتابعة؟"
      : "This will reinitialize secure storage and the Android Keystore key. Saved security settings and data may be lost if no recoverable copy exists. Continue?");
    if (!confirmed) return;
    setResetting(true);
    const cleared = await nativeBridge.secureStorageClearOwned();
    if (!cleared) {
      setResetting(false);
      window.alert(ar ? "تعذّرت إعادة تهيئة التخزين الآمن. لم يتم حذف البيانات." : "Secure storage could not be reinitialized. No data was deleted.");
      return;
    }
    window.location.reload();
  };
  const message = ar
    ? "تم إيقاف الدخول لحماية البيانات. لم يتم إنشاء مفتاح بديل ولم يتم حذف أي سجل تلقائيًا."
    : "Access is paused to protect your data. No replacement key was created and no stored record was erased automatically.";
  const details = ar
    ? "إذا كان السبب بطء بدء Android، أعد الفحص أولًا. إعادة التهيئة ليست جزءًا من التشغيل العادي، وتُستخدم فقط كاسترداد أخير بعد التأكد من فقدان مفتاح Keystore أو تلف التخزين."
    : "If Android is still starting, retry first. Reinitialization is not part of normal startup; use it only as a last-resort recovery after confirming a missing Keystore key or corrupted storage.";

  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-night px-6 py-10 text-center">
      <div className="grid size-16 place-items-center rounded-2xl border border-danger/50 bg-danger-bg text-danger">
        <AlertTriangle className="size-8" />
      </div>
      <h1 className="mt-5 text-xl font-bold text-ink">
        {ar ? "تعذّر فتح التخزين الآمن" : "Secure storage is unavailable"}
      </h1>
      <p className="mt-3 max-w-md text-sm leading-7 text-muted">{message}</p>
      {errorCode ? (
        <p className="mt-4 rounded-lg border border-line bg-surface px-3 py-2 text-xs text-muted">
          {ar ? "رمز التشخيص:" : "Diagnostic code:"} <code>{errorCode}</code>
        </p>
      ) : null}
      <p className="mt-4 max-w-md rounded-lg border border-line bg-surface p-3 text-xs leading-6 text-muted">
        {details}
      </p>
      <button
        type="button"
        onClick={retry}
        disabled={resetting}
        className="mt-6 flex h-12 w-full max-w-sm items-center justify-center gap-2 rounded-lg bg-cyan font-semibold text-night disabled:opacity-60"
      >
        <RefreshCw className="size-4" />
        {ar ? "إعادة الفحص والمحاولة" : "Retry secure storage"}
      </button>
      <details className="mt-3 w-full max-w-sm rounded-lg border border-line bg-surface text-start">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-muted">
          <span>{ar ? "خيارات الاسترداد المتقدمة" : "Advanced recovery"}</span>
          <ChevronDown className="size-4" />
        </summary>
        <div className="border-t border-line p-3 text-xs leading-6 text-muted">
          <p>{ar ? "لا تظهر إعادة التهيئة أثناء التشغيل الطبيعي. افتح هذا القسم فقط إذا فشلت إعادة الفحص المتكررة." : "Reinitialization stays hidden during normal startup. Open this section only after repeated retries fail."}</p>
          <button
            type="button"
            onClick={() => void resetSecureStorage()}
            disabled={resetting}
            className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-danger/50 bg-danger-bg font-semibold text-danger disabled:opacity-60"
          >
            <RotateCcw className="size-4" />
            {resetting ? (ar ? "جارٍ إعادة التهيئة…" : "Reinitializing…") : (ar ? "إعادة تهيئة التخزين الآمن" : "Reinitialize secure storage")}
          </button>
        </div>
      </details>
    </main>
  );
}
