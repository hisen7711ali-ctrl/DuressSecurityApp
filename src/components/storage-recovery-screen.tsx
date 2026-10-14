import { useState } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { secureStorageClearOwned } from "@/lib/native-bridge";
import { wipeAppData } from "@/lib/security-service";
import { useCopy } from "@/lib/use-copy";

/** Fail-closed recovery when an Android Keystore record cannot be decrypted. */
export function StorageRecoveryScreen() {
  const { lang } = useCopy();
  const [confirm, setConfirm] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<"secure-store" | "web-storage" | null>(null);
  const ar = lang === "ar";

  async function resetOwnedData() {
    if (working) return;
    setWorking(true);
    setError(null);
    let clearedSecureStore = false;
    try {
      const cleared = await secureStorageClearOwned();
      if (!cleared) {
        setError("secure-store");
        return;
      }
      clearedSecureStore = true;

      // IndexedDB/cache deletion can be blocked by a stale WebView connection.
      // Bound the wait so this recovery screen never spins forever.
      let timeoutId = 0;
      try {
        await Promise.race([
          wipeAppData(),
          new Promise<never>((_, reject) => {
            timeoutId = window.setTimeout(() => reject(new Error("APP_DATA_RESET_TIMEOUT")), 8000);
          }),
        ]);
      } finally {
        if (timeoutId) window.clearTimeout(timeoutId);
      }
      window.location.reload();
    } catch (caught) {
      console.error("[DuressSecurity] Recovery reset failed", caught);
      setError(clearedSecureStore ? "web-storage" : "secure-store");
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
          ? "لم يتم فتح التطبيق لأن سجل الحماية المشفّر لم يمكن التحقق منه. لم يتم اعتبار القفل منتهيًا ولم نفتح الخزنة. يمكنك إعادة المحاولة لاحقًا، أو مسح بيانات هذا التطبيق فقط والبدء من جديد."
          : "The app is paused because its encrypted security record could not be verified. The lock was not treated as expired and the vault was not opened. Retry later, or erase only this app's data and start again."}
      </p>
      {error ? (
        <p className="mt-4 max-w-md rounded-lg border border-danger/40 bg-danger-bg p-3 text-sm text-danger">
          {error === "secure-store"
            ? (ar ? "تعذّر مسح التخزين الآمن. لم تتم إعادة التهيئة. لا تكرر الضغط؛ أغلق جلسة المحاكي وافتح جهازًا جديدًا، أو افحص سجل Android Keystore." : "The secure store could not be cleared. Reinitialization was not completed. Do not keep retrying; restart the emulator session or inspect Android Keystore logs.")
            : (ar ? "تم مسح سجل التخزين الآمن، لكن حذف بيانات الواجهة استغرق وقتًا أطول من المتوقع. أغلق التطبيق وافتحه مجددًا؛ لا تكرر عملية المسح." : "The secure-store records were cleared, but clearing the WebView-owned data timed out. Close and reopen the app; do not repeat the erase action.")}
        </p>
      ) : null}
      {!confirm ? (
        <button type="button" onClick={() => setConfirm(true)} className="mt-6 flex h-12 w-full max-w-sm items-center justify-center gap-2 rounded-lg border border-line bg-surface text-sm font-semibold text-ink">
          <ShieldCheck className="size-4" />
          {ar ? "إعادة تهيئة بيانات التطبيق" : "Reset this app's data"}
        </button>
      ) : (
        <section className="mt-6 w-full max-w-sm rounded-xl border border-danger/50 bg-surface p-4">
          <p className="text-sm font-semibold text-ink">
            {ar ? "تأكيد نهائي: ستحذف الرموز والخزنة والإعدادات المحلية لهذا التطبيق فقط." : "Final confirmation: this deletes only this app's PINs, vault and local settings."}
          </p>
          <div className="mt-4 flex gap-3">
            <button type="button" disabled={working || error !== null} onClick={() => { void resetOwnedData(); }} className="h-11 flex-1 rounded-lg bg-danger px-3 text-sm font-semibold text-white disabled:opacity-50">
              {working ? (ar ? "جارٍ المسح…" : "Resetting…") : (ar ? "مسح وإعادة البدء" : "Erase and restart")}
            </button>
            <button type="button" disabled={working} onClick={() => setConfirm(false)} className="h-11 flex-1 rounded-lg border border-line px-3 text-sm text-ink disabled:opacity-50">
              {ar ? "إلغاء" : "Cancel"}
            </button>
          </div>
        </section>
      )}
      <p className="mt-8 max-w-sm text-xs leading-6 text-faint">
        {ar ? "لن يتم مسح الهاتف أو تطبيقات أخرى. هذا الإجراء يمسح بيانات Duress Security فقط." : "This does not factory-reset the phone or erase other apps. Only Duress Security's own data is reset."}
      </p>
    </main>
  );
}
