import type { ReactNode } from "react";
import { Fingerprint, ShieldCheck } from "lucide-react";
import { ToggleRow } from "@/components/apps-screen";
import { useAppStore, type PermKey } from "@/lib/store";
import { useCopy } from "@/lib/use-copy";
import { isNativeAndroid, lockNow as requestSystemLock } from "@/lib/native-bridge";

export function SettingsScreen() {
  const { t, lang } = useCopy();
  const theme = useAppStore((s) => s.theme);
  const backgroundImage = useAppStore((s) => s.backgroundImage);
  const setBackgroundImage = useAppStore((s) => s.setBackgroundImage);
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

  async function onBackgroundImageSelected(input: HTMLInputElement) {
    const file = input.files?.[0]; input.value = ""; if (!file) return;
    if (!file.type.startsWith("image/")) { setToast(lang === "ar" ? "اختر ملف صورة فقط." : "Select an image file."); return; }
    if (file.size > 20 * 1024 * 1024) { setToast(lang === "ar" ? "الصورة الأصلية أكبر من 20 ميغابايت." : "The source image exceeds 20 MB."); return; }
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d"); if (!context) throw new Error("CANVAS_UNAVAILABLE");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
      let encoded = canvas.toDataURL("image/jpeg", 0.72); if (encoded.length > 850_000) encoded = canvas.toDataURL("image/jpeg", 0.52);
      if (encoded.length > 1_000_000) throw new Error("IMAGE_TOO_LARGE");
      setBackgroundImage(encoded); setToast(lang === "ar" ? "تم تحديث خلفية التطبيق." : "App background updated.");
    } catch { setToast(lang === "ar" ? "تعذّر معالجة الصورة. جرّب صورة أصغر أو بصيغة أخرى." : "Could not process the image. Try a smaller image or another format."); }
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
        <div className="border-t border-line px-4 py-3">
          <p className="text-sm">{lang === "ar" ? "خلفية مخصصة" : "Custom background"}</p>
          <p className="mt-1 text-xs leading-5 text-muted">{lang === "ar" ? "اختر صورة من الجهاز؛ تُضغط محليًا وتحفظ ضمن إعدادات التطبيق." : "Choose an image from the device; it is compressed locally and saved in app settings."}</p>
          <input type="file" accept="image/*" className="mt-3 block w-full text-xs text-muted file:me-3 file:rounded-md file:border-0 file:bg-cyan file:px-3 file:py-2 file:font-semibold file:text-night" onChange={(event) => void onBackgroundImageSelected(event.currentTarget)} />
          {backgroundImage ? <button type="button" onClick={() => { setBackgroundImage(null); setToast(lang === "ar" ? "تمت استعادة الخلفية الافتراضية." : "Default background restored."); }} className="mt-3 h-9 rounded-md border border-line px-3 text-xs">{lang === "ar" ? "إزالة الخلفية المخصصة" : "Remove custom background"}</button> : null}
        </div>
      </section>

      <button type="button" onClick={() => setPanel("pins")} className="rounded-xl border border-line bg-surface px-4 py-4 text-start">
        <p className="text-sm font-semibold">{t.pinSection}</p>
        <p className="mt-1 text-xs text-muted">{t.pinManageHint}</p>
      </button>

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
