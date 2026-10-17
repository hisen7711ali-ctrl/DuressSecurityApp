import { useEffect, useState, type ChangeEvent, type ReactNode } from "react";
import { Fingerprint, ShieldCheck } from "lucide-react";
import { ToggleRow } from "@/components/apps-screen";
import { useAppStore, type PermKey } from "@/lib/store";
import { useCopy } from "@/lib/use-copy";
import { isNativeAndroid, lockNow as requestSystemLock } from "@/lib/native-bridge";
import { getStoredValue, removeStoredValue, setStoredValue } from "@/lib/app-storage";

const APP_LOCK_BACKGROUND_KEY = "duress-security-app-lock-background-image";
const MAX_BACKGROUND_DATA_URL_CHARS = 450_000;

async function compressBackgroundImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("IMAGE_REQUIRED");
  const image = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 768 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("CANVAS_UNAVAILABLE");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.65, 0.5, 0.35]) {
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error("IMAGE_ENCODING_FAILED")), "image/jpeg", quality);
      });
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("IMAGE_ENCODING_FAILED"));
        reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("IMAGE_ENCODING_FAILED"));
        reader.readAsDataURL(blob);
      });
      if (dataUrl.length <= MAX_BACKGROUND_DATA_URL_CHARS) return dataUrl;
    }
    throw new Error("IMAGE_TOO_LARGE");
  } finally {
    image.close();
  }
}

export function SettingsScreen() {
  const { t, lang } = useCopy();
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const setLang = useAppStore((s) => s.setLang);
  const setPanel = useAppStore((s) => s.setPanel);
  const homeLockEnabled = useAppStore((s) => s.homeLockEnabled);
  const preventUninstall = useAppStore((s) => s.preventUninstall);
  const deviceOwner = useAppStore((s) => s.deviceOwner);
  const dedicatedDeviceMode = useAppStore((s) => s.dedicatedDeviceMode);
  const refreshNativePermissions = useAppStore((s) => s.refreshNativePermissions);
  const overlayPermission = useAppStore((s) => s.overlayPermission);
  const usagePermission = useAppStore((s) => s.usagePermission);
  const deviceAdmin = useAppStore((s) => s.deviceAdmin);
  const deviceSecure = useAppStore((s) => s.deviceSecure);
  const accessibilityPermission = useAppStore((s) => s.accessibilityPermission);
  const autostartPermission = useAppStore((s) => s.autostartPermission);
  const notificationPermission = useAppStore((s) => s.notificationPermission);
  const openOverlay = useAppStore((s) => s.openOverlay);
  const lockSession = useAppStore((s) => s.lockSession);
  const biometricEnabled = useAppStore((s) => s.biometricEnabled);
  const setBiometricEnabled = useAppStore((s) => s.setBiometricEnabled);
  const requestDeviceAdminNative = useAppStore((s) => s.requestDeviceAdminNative);
  const setToast = useAppStore((s) => s.setToast);
  const native = isNativeAndroid();
  const [lockBackground, setLockBackground] = useState<string | null>(null);
  const [backgroundBusy, setBackgroundBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getStoredValue(APP_LOCK_BACKGROUND_KEY).then((value) => {
      if (!cancelled && value?.startsWith("data:image/")) setLockBackground(value);
    }).catch(() => {
      if (!cancelled) setLockBackground(null);
    });
    return () => { cancelled = true; };
  }, []);

  async function onBackgroundSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBackgroundBusy(true);
    try {
      const dataUrl = await compressBackgroundImage(file);
      const saved = await setStoredValue(APP_LOCK_BACKGROUND_KEY, dataUrl);
      if (!saved) throw new Error("SECURE_SAVE_FAILED");
      setLockBackground(dataUrl);
      setToast(lang === "ar"
        ? "تم حفظ خلفية قفل التطبيقات. لن يُحذف الملف الأصلي من جهازك."
        : "App Lock background saved. The original file on your device was not deleted.");
    } catch {
      setToast(lang === "ar"
        ? "تعذّر حفظ الصورة. اختر صورة أخرى أصغر حجمًا (يُحفظ إصدار مصغّر ومشفّر)."
        : "Could not save the image. Choose another smaller image; a resized encrypted copy is stored.");
    } finally {
      setBackgroundBusy(false);
    }
  }

  async function clearBackground() {
    try {
      await removeStoredValue(APP_LOCK_BACKGROUND_KEY);
      setLockBackground(null);
      setToast(lang === "ar" ? "تمت إزالة خلفية قفل التطبيقات." : "App Lock background removed.");
    } catch {
      setToast(lang === "ar" ? "تعذّر إزالة الخلفية من التخزين الآمن." : "Could not remove the background from secure storage.");
    }
  }

  async function onActivateDeviceAdmin() {
    if (!native) {
      setToast(t.nativeOnlyToast);
      return;
    }
    const granted = await requestDeviceAdminNative();
    await refreshNativePermissions();
    const latest = useAppStore.getState();
    if (!granted) {
      setToast(lang === "ar"
        ? "لم يتم تفعيل صلاحية مسؤول الجهاز. وافق على شاشة أندرويد ثم ارجع إلى التطبيق."
        : "Device Admin was not enabled. Approve Android's system prompt, then return to the app.");
    } else if (!latest.deviceSecure) {
      setToast(lang === "ar"
        ? "تم تفعيل مسؤول الجهاز. لضمان قفل الشاشة، اضبط PIN أو نمطًا من إعدادات أندرويد."
        : "Device Admin is active. Set a PIN or pattern in Android Settings for secure screen locking.");
    } else {
      setToast(t.deviceAdminActive);
    }
  }

  async function onLockPhoneNow() {
    if (!native) {
      setToast(t.nativeOnlyToast);
      return;
    }
    await refreshNativePermissions();
    const latest = useAppStore.getState();
    if (!latest.deviceAdmin) {
      setToast(lang === "ar"
        ? "فعّل صلاحية مسؤول الجهاز أولاً."
        : "Enable Device Admin first.");
      return;
    }
    if (!latest.deviceSecure) {
      setToast(lang === "ar"
        ? "اضبط PIN أو نمطًا لقفل شاشة أندرويد أولاً؛ من دونه قد ينام الهاتف دون قفله."
        : "Set an Android screen PIN or pattern first; without one, the device may sleep without locking.");
      return;
    }
    const ok = await requestSystemLock();
    if (!ok) {
      setToast(lang === "ar"
        ? "أندرويد لم يؤكد طلب قفل الشاشة. تحقق من صلاحية الإدارة وإعدادات القفل."
        : "Android did not confirm the lock request. Check admin permission and screen-lock settings.");
    }
  }

  const perms: { key: PermKey; label: string; hint: string; ok: boolean }[] = [
    { key: "overlayPermission", label: t.overlayPerm, hint: t.permOverlayHint, ok: overlayPermission },
    { key: "usagePermission", label: t.usagePerm, hint: t.permUsageHint, ok: usagePermission },
    { key: "accessibilityPermission", label: t.accessibilityPerm, hint: t.permAccessHint, ok: accessibilityPermission },
    { key: "autostartPermission", label: t.autostartPerm, hint: t.permAutoHint, ok: autostartPermission },
    { key: "notificationPermission", label: t.notificationPerm, hint: t.permNotifHint, ok: notificationPermission },
  ];
  const grantedCount = perms.filter((p) => p.ok).length;

  return (
    <div className="flex flex-col gap-4 pb-4">
      <header className="pt-2">
        <h1 className="text-lg font-bold">{t.settings}</h1>
      </header>

      <section className="rounded-xl border border-line bg-surface p-4">
        <p className="text-sm font-semibold text-cyan">{t.offlineTitle}</p>
        <p className="mt-2 text-xs leading-relaxed text-muted">{t.offlineBody}</p>
      </section>

      <section className="overflow-hidden rounded-xl border border-line bg-surface">
        <h2 className="px-4 pt-4 text-sm font-semibold text-cyan">{t.systemPrefs}</h2>
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm">{t.theme}</span>
          <div className="flex rounded-md bg-navy p-1">
            <Seg active={theme === "dark"} onClick={() => setTheme("dark")}>
              {t.dark}
            </Seg>
            <Seg active={theme === "light"} onClick={() => setTheme("light")}>
              {t.light}
            </Seg>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-line px-4 py-3">
          <span className="text-sm">{t.language}</span>
          <div className="flex rounded-md bg-navy p-1">
            <Seg active={lang === "ar"} onClick={() => setLang("ar")}>
              {t.arabic}
            </Seg>
            <Seg active={lang === "en"} onClick={() => setLang("en")}>
              {t.english}
            </Seg>
          </div>
        </div>
      </section>

      <button type="button" onClick={() => setPanel("pins")} className="rounded-xl border border-line bg-surface px-4 py-4 text-start">
        <p className="text-sm font-semibold">{t.pinSection}</p>
        <p className="mt-1 text-xs text-muted">{t.pinManageHint}</p>
      </button>

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold text-cyan">{lang === "ar" ? "خلفية قفل التطبيقات" : "App Lock background"}</h2>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          {lang === "ar"
            ? "اختر صورة من ملفات جهازك لتظهر خلف شاشة قفل التطبيقات. تُحوَّل إلى صورة مصغّرة وتُحفظ في مساحة التطبيق المشفّرة. لا يحذف التطبيق الملف الأصلي."
            : "Choose an image from your device for the App Lock screen. A resized copy is stored in the app's encrypted storage. The original file is not deleted."}
        </p>
        {lockBackground ? <img src={lockBackground} alt={lang === "ar" ? "معاينة خلفية قفل التطبيقات" : "App Lock background preview"} className="mt-3 max-h-40 w-full rounded-lg object-cover" /> : null}
        <label className="mt-3 flex h-11 cursor-pointer items-center justify-center rounded-lg bg-cyan px-3 text-sm font-semibold text-night">
          {backgroundBusy ? (lang === "ar" ? "جارٍ حفظ الصورة…" : "Saving image…") : (lang === "ar" ? "اختيار صورة من الجهاز" : "Choose image from device")}
          <input type="file" accept="image/*" disabled={backgroundBusy} onChange={(event) => void onBackgroundSelected(event)} className="sr-only" />
        </label>
        {lockBackground ? <button type="button" onClick={() => void clearBackground()} className="mt-2 h-10 w-full rounded-lg border border-line text-xs text-muted">{lang === "ar" ? "إزالة الخلفية" : "Remove background"}</button> : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="px-1 text-sm font-semibold text-cyan">{t.lockSection}</h2>
        <ToggleRow
          label={t.homeLock}
          on={homeLockEnabled}
          onToggle={(value) =>
            openOverlay({
              kind: "confirm",
              action: { type: "toggle-home-lock", value },
              title: t.enterMasterConfirm,
            })
          }
        />
        <ToggleRow
          label={lang === "ar" ? "منع الإزالة" : "Block uninstall"}
          hint={preventUninstall
            ? (lang === "ar" ? "سياسة منع الإزالة مفعّلة على مستوى أندرويد." : "Android uninstall-block policy is active on this device.")
            : !deviceOwner
              ? (lang === "ar"
                ? "غير مدعوم بعد: يلزم إعداد رسمي كمالك الجهاز (Device Owner). مسؤول الجهاز العادي والأذونات الإضافية لا تمنع الإزالة. للاختبار فقط على محاكي جديد ونظيف بعد تثبيت التطبيق: adb shell dpm set-device-owner com.duresssecurity.app/com.duresssecurity.admin.AdminReceiver أو استخدم QR Provisioning رسميًا. لا تنفّذ الأمر على هاتفك الأساسي؛ قد يفشل إذا كان الجهاز مُعدًا بالفعل."
                : "Not supported yet: formal Device Owner provisioning is required. Device Admin and extra permissions cannot block uninstall. Use a clean dedicated test emulator with official provisioning or adb dpm; do not run it on your primary phone.")
              : (lang === "ar" ? "مالك الجهاز مفعّل، لكن أندرويد لم يؤكد سياسة منع الإزالة بعد." : "Device Owner is active, but Android has not confirmed the uninstall-block policy yet.")}
          on={preventUninstall}
          disabled={!deviceOwner && !preventUninstall}
          onToggle={(value) =>
            openOverlay({
              kind: "confirm",
              action: { type: "toggle-prevent", value },
              title: t.enterMasterConfirm,
            })
          }
        />
      </section>

      <section className="rounded-xl border border-line bg-surface p-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-cyan" />
          <h2 className="text-sm font-semibold text-cyan">{t.deviceLevelTitle}</h2>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted">{t.deviceLevelBody}</p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className={`text-xs ${deviceAdmin ? "text-success" : "text-danger"}`}>
            {deviceAdmin ? t.deviceAdminActive : t.deviceAdminInactive}
          </span>
          {deviceAdmin ? null : (
            <button type="button" onClick={onActivateDeviceAdmin} className="h-9 shrink-0 rounded-md bg-cyan px-3 text-xs font-semibold text-night">
              {t.activateDeviceAdmin}
            </button>
          )}
        </div>
        <p className={`mt-2 text-xs leading-relaxed ${deviceSecure ? "text-success" : "text-muted"}`}>
          {deviceSecure
            ? (lang === "ar" ? "قفل شاشة أندرويد الآمن: مفعّل." : "Android secure screen lock: configured.")
            : (lang === "ar" ? "قفل شاشة الهاتف شيء مستقل: اضبط PIN أو نمطًا من إعدادات أندرويد. التطبيق لا يستطيع إنشاء كلمة مرور النظام بدلًا منك." : "The phone's secure screen lock is separate: set a PIN or pattern in Android Settings. The app cannot create the system password for you.")}
        </p>
        <button
          type="button"
          onClick={() => { void onLockPhoneNow(); }}
          disabled={!native || !deviceAdmin || !deviceSecure}
          className="mt-3 h-10 w-full rounded-lg border border-cyan/40 bg-cyan/10 text-xs font-semibold text-cyan disabled:cursor-not-allowed disabled:opacity-40"
        >
          {lang === "ar" ? "اختبار قفل شاشة الهاتف الآن" : "Test Android screen lock now"}
        </button>
      </section>

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold text-cyan">{lang === "ar" ? "وضع الجهاز المخصص (Kiosk)" : "Dedicated device mode (Kiosk)"}</h2>
        <p className="mt-2 text-xs leading-relaxed text-muted">{lang === "ar" ? "يحاول التطبيق تفعيل وضع الجهاز المخصص مباشرةً؛ يطبّق أندرويد القيود المطلوبة على مستوى الجهاز." : "The app asks Android to enable dedicated-device mode directly; Android applies the required device-level restrictions."}</p>
        <p className={`mt-2 text-xs ${deviceOwner ? "text-success" : "text-muted"}`}>
          {deviceOwner
            ? (lang === "ar" ? "حالة إدارة الجهاز: مفعّلة" : "Device management: active")
            : (lang === "ar" ? "حالة إدارة الجهاز: غير مفعّلة" : "Device management: not active")}
        </p>
        <div className="mt-3">
          <ToggleRow
            label={lang === "ar" ? "وضع الجهاز المخصص (Kiosk)" : "Dedicated device mode (Kiosk)"}
            hint={lang === "ar" ? "يحاول التطبيق تفعيل وضع الجهاز المخصص مباشرةً؛ يطبّق أندرويد القيود المطلوبة على مستوى الجهاز." : "The app asks Android to enable dedicated-device mode directly; Android applies the required device-level restrictions."}
            on={dedicatedDeviceMode}
            onToggle={(value) =>
              openOverlay({
                kind: "confirm",
                action: { type: "toggle-kiosk", value },
                title: t.enterMasterConfirm,
              })
            }
          />
        </div>
      </section>

      <section className="rounded-xl border border-line bg-surface p-4">
        <div className="flex items-center gap-2">
          <Fingerprint className="size-4 text-cyan" />
          <h2 className="text-sm font-semibold text-cyan">{t.biometricSection}</h2>
        </div>
        <ToggleRow
          label={t.biometricUnlock}
          hint={t.biometricHint}
          on={biometricEnabled}
          onToggle={(value) => {
            if (value && !native) {
              setToast(t.nativeOnlyToast);
              return;
            }
            setBiometricEnabled(value);
          }}
        />
        <p className="mt-3 text-xs leading-relaxed text-muted">{t.biometricNote}</p>
      </section>

      <p className="px-1 text-xs leading-relaxed text-muted">
        {lang === "ar"
          ? "ملاحظة الصلاحيات: منع الإزالة يعتمد على Device Owner فقط؛ لا تعوّضه صلاحيات Accessibility أو تجاهل تحسين البطارية أو Foreground Service. قفل التطبيقات يحتاج تفعيل Accessibility يدويًا من شاشة أندرويد. لا يستطيع التطبيق منح نفسه هذه الصلاحيات."
          : "Permission note: uninstall blocking depends on Device Owner; Accessibility, battery-optimization exemption, or a Foreground Service do not replace it. App Lock needs Accessibility enabled manually in Android Settings. The app cannot grant itself these permissions."}
      </p>

      <section className="rounded-xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-cyan">{t.grantPerms}</h2>
          <span className="text-xs text-muted">
            {grantedCount}/{perms.length}
          </span>
        </div>
        <p className="mt-2 text-xs text-muted">{t.permissionsBody}</p>
        {perms.map((perm) => (
          <PermLine
            key={perm.key}
            label={perm.label}
            hint={perm.hint}
            ok={perm.ok}
            onGrant={() =>
              openOverlay({
                kind: "confirm",
                action: { type: "grant-one", key: perm.key },
                title: t.enterMasterConfirm,
              })
            }
            tGrant={t.grant}
            tOk={t.granted}
            tNo={t.missing}
          />
        ))}
      </section>

      <button type="button" onClick={lockSession} className="h-12 rounded-xl border border-line bg-surface font-semibold text-cyan">
        {t.sessionLock}
      </button>

      <p className="px-1 text-xs leading-relaxed text-faint">{t.aboutBody}</p>
    </div>
  );
}

function Seg({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-8 rounded-sm px-3 text-xs font-semibold ${active ? "bg-cyan text-night" : "text-muted"}`}
    >
      {children}
    </button>
  );
}

function PermLine({
  label,
  hint,
  ok,
  onGrant,
  tGrant,
  tOk,
  tNo,
}: {
  label: string;
  hint: string;
  ok: boolean;
  onGrant: () => void;
  tGrant: string;
  tOk: string;
  tNo: string;
}) {
  return (
    <div className="mt-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        <p className="text-xs text-muted">{hint}</p>
        <p className={`text-xs ${ok ? "text-success" : "text-danger"}`}>{ok ? tOk : tNo}</p>
      </div>
      {ok ? null : (
        <button type="button" onClick={onGrant} className="h-9 shrink-0 rounded-md bg-surface-2 px-3 text-xs font-semibold">
          {tGrant}
        </button>
      )}
    </div>
  );
}
