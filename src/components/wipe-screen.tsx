import { useCallback, useEffect, useState } from "react";
import { ShieldMark } from "@/components/shield-mark";
import { wipeAppData } from "@/lib/security-service";
import { useAppStore } from "@/lib/store";
import { isNativeAndroid, secureStorageClearOwned, secureStorageGet, setKioskMode, setSelfUninstallBlocked } from "@/lib/native-bridge";
import { useCopy } from "@/lib/use-copy";

const OWNED_SECURE_KEYS = [
  "duress-security-app",
  "duress-security-state",
  "duress-security-app-lock-maintenance",
  "duress-security-vault-device-secret",
];

async function verifyOwnedSecureStoreEmpty(): Promise<boolean> {
  for (const key of OWNED_SECURE_KEYS) {
    const result = await secureStorageGet(key);
    if (!result.available || result.found) return false;
  }
  return true;
}

export function WipeScreen() {
  const { t, lang } = useCopy();
  const wipeLocal = useAppStore((s) => s.wipeLocal);
  const [wipeError, setWipeError] = useState(false);

  const performWipe = useCallback(async () => {
    setWipeError(false);
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
      // wipeLocal only recreates a clean default configuration after the old
      // app-owned records have been removed; no permission or confirmation UI is
      // requested by the 7777 emergency wipe flow.
      wipeLocal();
    } catch {
      setWipeError(true);
    }
  }, [wipeLocal]);

  useEffect(() => {
    void performWipe();
  }, [performWipe]);

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-night px-6 text-center">
      <ShieldMark size={88} />
      <h1 className="mt-6 text-2xl font-bold">{t.wipeTitle}</h1>
      <p className="mt-2 max-w-sm text-sm text-muted">{wipeError
        ? (lang === "ar" ? "تعذر تأكيد مسح التخزين الآمن؛ لم يتم اعتماد التصفير. أعد المحاولة أو ارجع لشاشة الدخول." : "Secure storage could not be verified as cleared; the reset was not committed. Retry or return to the app lock.")
        : t.wipeBody}</p>
      {wipeError ? (
        <div className="mt-5 flex w-full max-w-sm gap-3">
          <button type="button" onClick={() => { void performWipe(); }} className="h-11 flex-1 rounded-lg bg-cyan px-4 text-sm font-semibold text-night">
            {lang === "ar" ? "إعادة المحاولة" : "Retry"}
          </button>
        </div>
      ) : null}
      {!wipeError ? <div className="mt-8 h-1.5 w-48 overflow-hidden rounded-full bg-surface">
        <div className="h-full w-full origin-right animate-pulse bg-cyan" />
      </div> : null}
    </div>
  );
}
