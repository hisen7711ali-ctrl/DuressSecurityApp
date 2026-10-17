import { useCallback, useRef, useState } from "react";
import { ShieldMark } from "@/components/shield-mark";
import { wipeAppData } from "@/lib/security-service";
import { useAppStore } from "@/lib/store";
import { isNativeAndroid, secureStorageClearOwned, secureStorageGet, setKioskMode, setSelfUninstallBlocked } from "@/lib/native-bridge";
import { useCopy } from "@/lib/use-copy";

const OWNED_SECURE_KEYS = [
  "duress-security-app",
  "duress-security-app:calculator-command",
  "duress-security-state",
  "duress-security-app-lock-maintenance",
  "duress-security-vault-device-secret",
];

async function verifyOwnedSecureStoreEmpty(): Promise<boolean> {
  for (const key of OWNED_SECURE_KEYS) {
    const result = await secureStorageGet(key);
    if (result.available) {
      if (result.found) return false;
      continue;
    }
    // removeOwned() deletes both app-owned records and the Android Keystore
    // alias. After a confirmed clear, KEY_MISSING is the expected empty-store
    // result; unrelated I/O/Keystore failures must still abort the reset.
    if (result.reason === "KEY_MISSING") continue;
    return false;
  }
  return true;
}

export function WipeScreen() {
  const { t, lang } = useCopy();
  const wipeLocal = useAppStore((s) => s.wipeLocal);
  const lockSession = useAppStore((s) => s.lockSession);
  const [wipeError, setWipeError] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [wipeBusy, setWipeBusy] = useState(false);
  const wipeInProgress = useRef(false);

  const performWipe = useCallback(async () => {
    if (!acknowledged || wipeInProgress.current) return;
    wipeInProgress.current = true;
    setWipeError(false);
    setWipeBusy(true);
    try {
      if (isNativeAndroid()) {
        // Release app-owned device policies while their configuration still exists, before erasing the secure store.
        await Promise.all([setKioskMode(false), setSelfUninstallBlocked(false)]);
        // Clear the Android Keystore-backed store first. The verification below
        // proves the old encrypted records and device-bound vault secret are gone
        // before the in-memory Zustand state is replaced with fresh defaults.
        if (!(await secureStorageClearOwned()) || !(await verifyOwnedSecureStoreEmpty())) {
          setWipeError(true);
          return;
        }
      }
      await wipeAppData();
      // This operation only resets Duress Security-owned data. It never erases
      // other apps or the Android device. It is user-triggered below, not on mount.
      wipeLocal();
    } catch {
      setWipeError(true);
    } finally {
      wipeInProgress.current = false;
      setWipeBusy(false);
    }
  }, [acknowledged, wipeLocal]);

  return (
    <div className="bg-mountains flex min-h-svh flex-col items-center justify-center px-6 text-center">
      <ShieldMark size={88} />
      <h1 className="mt-6 text-2xl font-bold">{t.wipeTitle}</h1>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted">{wipeError
        ? (lang === "ar" ? "تعذّر تأكيد مسح التخزين الآمن؛ لم يتم اعتماد التصفير. لم يُمسح أي شيء خارج نطاق التطبيق. راجع الإعدادات وحاول يدوياً مرة أخرى." : "Secure storage could not be verified as cleared; reset was not committed. Nothing outside this app was erased. Review and retry manually.")
        : (lang === "ar" ? "لم يبدأ المسح بعد. هذا الإجراء يمسح بيانات Duress Security التي يملكها التطبيق فقط، ولا يمسح واتساب أو الملفات العامة أو نظام Android. لن يحدث شيء بسبب إعادة فتح هذه الشاشة وحدها." : "No reset has started. This affects only data owned by Duress Security; it does not erase WhatsApp, shared files, or Android. Merely reopening this screen cannot start the reset.")}</p>
      <label className="mt-5 flex w-full max-w-sm items-start gap-3 rounded-xl border border-line bg-surface p-4 text-start text-sm">
        <input type="checkbox" checked={acknowledged} disabled={wipeBusy} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-1 size-4 accent-cyan" />
        <span>{lang === "ar" ? "أفهم أن هذا سيحذف بيانات التطبيق والخزانة المشفّرة وإعداداته المحلية نهائياً." : "I understand this permanently deletes this app's data, encrypted vault and local settings."}</span>
      </label>
      <div className="mt-4 flex w-full max-w-sm flex-col gap-3">
        <button type="button" disabled={!acknowledged || wipeBusy} onClick={() => void performWipe()} className="h-12 rounded-lg bg-danger px-4 text-sm font-semibold text-white disabled:opacity-40">
          {wipeBusy ? (lang === "ar" ? "جارٍ التحقق والمسح..." : "Verifying and resetting...") : (lang === "ar" ? (wipeError ? "إعادة المحاولة يدوياً" : "مسح بيانات التطبيق التي يملكها") : (wipeError ? "Retry reset manually" : "Erase app-owned data"))}
        </button>
        <button type="button" disabled={wipeBusy} onClick={() => { setAcknowledged(false); lockSession(); }} className="h-11 rounded-lg border border-line px-4 text-sm font-semibold disabled:opacity-40">
          {lang === "ar" ? "إلغاء والعودة إلى القفل" : "Cancel and return to lock"}
        </button>
      </div>
    </div>
  );
}
