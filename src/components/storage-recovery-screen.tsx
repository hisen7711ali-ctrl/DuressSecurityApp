import { useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { secureStorageGet } from "@/lib/native-bridge";
import { useCopy } from "@/lib/use-copy";

/** Fail-closed recovery when an Android Keystore record cannot be decrypted. */
export function StorageRecoveryScreen({ errorCode }: { errorCode?: string | null }) {
  const { lang } = useCopy();
  const [working, setWorking] = useState(false);
  const [retryFailed, setRetryFailed] = useState(false);
  const ar = lang === "ar";

  async function retry() {
    if (working) return;
    setWorking(true);
    setRetryFailed(false);
    try {
      const result = await secureStorageGet("duress-security-state");
      if (result.available) {
        window.location.reload();
        return;
      }
      setRetryFailed(true);
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-night px-6 py-10 text-center">
      <div className="grid size-16 place-items-center rounded-2xl border border-danger/50 bg-danger-bg text-danger">
        <AlertTriangle className="size-8" />
      </div>
      <h1 className="mt-5 text-xl font-bold text-ink">
        {ar ? "تعذّر فتح التخزين الآمن" : "Secure storage is unavailable"}
      </h1>
      <p className="mt-3 max-w-md text-sm leading-7 text-muted">
        {ar
          ? "تم إيقاف الدخول لحماية البيانات. لم يتم إنشاء مفتاح بديل ولم يتم حذف أي سجل تلقائيًا."
          : "Access is paused to protect your data. No replacement key was created and no stored record was erased automatically."}
      </p>
      {errorCode ? (
        <p className="mt-4 max-w-md rounded-lg border border-line bg-surface px-3 py-2 text-xs text-muted">
          {ar ? "رمز التشخيص:" : "Diagnostic code:"} <code>{errorCode}</code>
        </p>
      ) : null}
      <p className="mt-4 max-w-md rounded-lg border border-line bg-surface p-3 text-xs leading-6 text-muted">
        {ar
          ? "إذا كان السبب بطء المحاكي أو بدء تشغيل Android، أعد الفحص. إذا كان المفتاح مفقودًا أو البيانات تالفة فلن يقوم التطبيق بالكتابة فوقها."
          : "If this is a slow emulator or startup delay, retry. If the key is missing or the data is corrupted, the app will not overwrite it."}
      </p>
      {retryFailed ? (
        <p className="mt-4 max-w-md rounded-lg border border-danger/40 bg-danger-bg p-3 text-sm text-danger">
          {ar ? "ما زال التخزين الآمن غير متاح. لم يتم حذف أي بيانات." : "Secure storage is still unavailable. No data was deleted."}
        </p>
      ) : null}
      <button
        type="button"
        disabled={working}
        onClick={() => { void retry(); }}
        className="mt-6 flex h-12 w-full max-w-sm items-center justify-center gap-2 rounded-lg bg-cyan font-semibold text-night disabled:opacity-50"
      >
        <RefreshCw className={working ? "size-4 animate-spin" : "size-4"} />
        {working ? (ar ? "جارٍ الفحص…" : "Checking…") : (ar ? "إعادة الفحص والمحاولة" : "Retry secure storage")}
      </button>
    </main>
  );
}
