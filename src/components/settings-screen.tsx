import { useEffect, useState, type ReactNode } from "react";
import { Fingerprint, ShieldCheck } from "lucide-react";
import { ToggleRow } from "@/components/apps-screen";
import { appName, useAppStore, type PermKey } from "@/lib/store";
import { useCopy } from "@/lib/use-copy";
import { isNativeAndroid, lockNow as requestSystemLock } from "@/lib/native-bridge";
import { beginDocumentPicker, clearDocumentPicker } from "@/lib/document-picker-guard";
import { BACKGROUND_PRESETS, type BackgroundPreset } from "@/lib/background-presets";
import { loadFailedAttemptHistory, type SecurityAttemptRecord } from "@/lib/security-audit";

function presetImageSource(preset: BackgroundPreset): string {
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(preset.svg);
}

function imageSourceToJpegDataUrl(source: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        if (!image.naturalWidth || !image.naturalHeight) throw new Error("INVALID_IMAGE");
        const ratio = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("CANVAS_UNAVAILABLE");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        let encoded = canvas.toDataURL("image/jpeg", 0.78);
        if (encoded.length > 850_000) encoded = canvas.toDataURL("image/jpeg", 0.56);
        if (encoded.length > 1_000_000) throw new Error("IMAGE_TOO_LARGE");
        resolve(encoded);
      } catch (error) { reject(error); }
    };
    image.onerror = () => reject(new Error("IMAGE_LOAD_FAILED"));
    image.src = source;
  });
}

function imageFileToDataUrl(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  return imageSourceToJpegDataUrl(objectUrl).finally(() => URL.revokeObjectURL(objectUrl));
}

export function SettingsScreen() {
  const { t, lang } = useCopy();
  const theme = useAppStore((s) => s.theme);
  const installedApps = useAppStore((s) => s.installedApps);
  const mainLockBackgroundImage = useAppStore((s) => s.mainLockBackgroundImage);
  const appLockBackgroundImage = useAppStore((s) => s.appLockBackgroundImage);
  const mainLockBackgroundPresetId = useAppStore((s) => s.mainLockBackgroundPresetId);
  const appLockBackgroundPresetId = useAppStore((s) => s.appLockBackgroundPresetId);
  const mainLockBackgroundScale = useAppStore((s) => s.mainLockBackgroundScale);
  const mainLockBackgroundX = useAppStore((s) => s.mainLockBackgroundX);
  const mainLockBackgroundY = useAppStore((s) => s.mainLockBackgroundY);
  const appLockBackgroundScale = useAppStore((s) => s.appLockBackgroundScale);
  const appLockBackgroundX = useAppStore((s) => s.appLockBackgroundX);
  const appLockBackgroundY = useAppStore((s) => s.appLockBackgroundY);
  const setLockBackground = useAppStore((s) => s.setLockBackground);
  const lockSession = useAppStore((s) => s.lockSession);
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
  const biometricEnabled = useAppStore((s) => s.biometricEnabled);
  const setBiometricEnabled = useAppStore((s) => s.setBiometricEnabled);
  const requestDeviceAdminNative = useAppStore((s) => s.requestDeviceAdminNative);
  const setToast = useAppStore((s) => s.setToast);
  const native = isNativeAndroid();
  const [backgroundTarget, setBackgroundTarget] = useState<"main" | "app">("main");
  const [backgroundDraftImage, setBackgroundDraftImage] = useState<string | null>(null);
  const [backgroundDraftPresetId, setBackgroundDraftPresetId] = useState<string | null>(null);
  const [backgroundScale, setBackgroundScale] = useState(1);
  const [backgroundX, setBackgroundX] = useState(0);
  const [backgroundY, setBackgroundY] = useState(0);
  const [backgroundPreviewOpen, setBackgroundPreviewOpen] = useState(false);
  const [backgroundPreviewApproved, setBackgroundPreviewApproved] = useState(false);
  const [failedHistory, setFailedHistory] = useState<SecurityAttemptRecord[] | null>(null);

  const storedLockImage = backgroundTarget === "main" ? mainLockBackgroundImage : appLockBackgroundImage;
  const storedLockPreset = backgroundTarget === "main" ? mainLockBackgroundPresetId : appLockBackgroundPresetId;
  const storedScale = backgroundTarget === "main" ? mainLockBackgroundScale : appLockBackgroundScale;
  const storedX = backgroundTarget === "main" ? mainLockBackgroundX : appLockBackgroundX;
  const storedY = backgroundTarget === "main" ? mainLockBackgroundY : appLockBackgroundY;

  useEffect(() => {
    const preset = storedLockPreset ? BACKGROUND_PRESETS.find((item) => item.id === storedLockPreset) : undefined;
    setBackgroundDraftImage(storedLockImage ?? (preset ? presetImageSource(preset) : null));
    setBackgroundDraftPresetId(storedLockPreset ?? null);
    setBackgroundScale(storedScale || 1);
    setBackgroundX(storedX || 0);
    setBackgroundY(storedY || 0);
    setBackgroundPreviewApproved(false);
    setBackgroundPreviewOpen(false);
  }, [backgroundTarget, storedLockImage, storedLockPreset, storedScale, storedX, storedY]);

  useEffect(() => {
    let active = true;
    const refresh = () => { void loadFailedAttemptHistory().then((items) => { if (active) setFailedHistory(items); }); };
    refresh();
    window.addEventListener("duress-security-audit-updated", refresh);
    return () => { active = false; window.removeEventListener("duress-security-audit-updated", refresh); };
  }, []);

  async function onBackgroundImageSelected(input: HTMLInputElement) {
    clearDocumentPicker();
    const file = input.files?.[0];
    input.value = "";
    if (!file) {
      const current = useAppStore.getState();
      if (current.session === "unlocked") current.lockSession();
      return;
    }
    if (!file.type.startsWith("image/")) { setToast(lang === "ar" ? "اختر ملف صورة فقط." : "Select an image file."); return; }
    if (file.size > 20 * 1024 * 1024) { setToast(lang === "ar" ? "الصورة الأصلية أكبر من 20 ميغابايت." : "The source image exceeds 20 MB."); return; }
    try {
      const compressed = await imageFileToDataUrl(file);
      setBackgroundDraftImage(compressed);
      setBackgroundDraftPresetId(null);
      setBackgroundPreviewApproved(false);
      setBackgroundPreviewOpen(false);
      setToast(lang === "ar" ? "تم تجهيز الصورة للمعاينة؛ لم تُحفظ بعد." : "Image ready to preview; it has not been saved yet.");
    } catch {
      setToast(lang === "ar" ? "تعذّر قراءة الصورة. جرّب صورة أصغر أو بصيغة أخرى." : "Could not read the image. Try a smaller image or another format.");
    }
  }

  async function onBackgroundPresetSelected(preset: BackgroundPreset) {
    try {
      setBackgroundDraftImage(null);
      setBackgroundPreviewApproved(false);
      setBackgroundPreviewOpen(false);
      const encoded = await imageSourceToJpegDataUrl(presetImageSource(preset));
      setBackgroundDraftImage(encoded);
      setBackgroundDraftPresetId(preset.id);
    } catch {
      setToast(lang === "ar" ? "تعذّر تجهيز الخلفية الجاهزة للمعاينة." : "Could not prepare the built-in background for preview.");
    }
  }

  function applyLockBackground() {
    if (!backgroundDraftImage || !backgroundPreviewApproved) return;
    setLockBackground(backgroundTarget, backgroundDraftImage, backgroundDraftPresetId, { scale: backgroundScale, x: backgroundX, y: backgroundY });
    setBackgroundPreviewOpen(false);
    setToast(lang === "ar" ? "تم حفظ الخلفية لهذا النوع من القفل." : "Background saved for this lock type.");
  }

  function resetLockBackground() {
    setLockBackground(backgroundTarget, null, null, { scale: 1, x: 0, y: 0 });
    setBackgroundDraftImage(null);
    setBackgroundDraftPresetId(null);
    setBackgroundScale(1);
    setBackgroundX(0);
    setBackgroundY(0);
    setBackgroundPreviewApproved(false);
    setBackgroundPreviewOpen(false);
    setToast(lang === "ar" ? "تمت استعادة الخلفية الافتراضية لهذا القفل." : "Default background restored for this lock.");
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
          <p className="text-sm font-semibold">{lang === "ar" ? "خلفيات القفل" : "Lock backgrounds"}</p>
          <p className="mt-1 text-xs leading-5 text-muted">{lang === "ar" ? "إعداد مستقل لكل قفل. اختر صورة أو خلفية جاهزة، عدّل القص والحجم، افتح المعاينة، ثم اضغط تطبيق للحفظ." : "Each lock has independent settings. Pick an image or preset, adjust crop and scale, preview, then Apply to save."}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-navy p-1">
            <button type="button" onClick={() => setBackgroundTarget("main")} aria-pressed={backgroundTarget === "main"} className={"rounded-md px-2 py-2 text-xs font-semibold " + (backgroundTarget === "main" ? "bg-cyan text-night" : "text-muted")}>{lang === "ar" ? "قفل التطبيق الرئيسي" : "Main app lock"}</button>
            <button type="button" onClick={() => setBackgroundTarget("app")} aria-pressed={backgroundTarget === "app"} className={"rounded-md px-2 py-2 text-xs font-semibold " + (backgroundTarget === "app" ? "bg-cyan text-night" : "text-muted")}>{lang === "ar" ? "قفل التطبيقات" : "App Lock"}</button>
          </div>
          <label className="mt-3 block text-xs font-semibold text-muted">{lang === "ar" ? "اختيار صورة من المعرض" : "Choose image from gallery"}</label>
          <input type="file" accept="image/*" className="mt-2 block w-full text-xs text-muted file:me-3 file:rounded-md file:border-0 file:bg-cyan file:px-3 file:py-2 file:font-semibold file:text-night" onClick={beginDocumentPicker} onChange={(event) => void onBackgroundImageSelected(event.currentTarget)} />
          <p className="mt-3 text-xs font-semibold text-muted">{lang === "ar" ? "خلفيات جاهزة" : "Built-in backgrounds"}</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {BACKGROUND_PRESETS.map((preset) => (
              <button key={preset.id} type="button" aria-pressed={backgroundDraftPresetId === preset.id} onClick={() => void onBackgroundPresetSelected(preset)} style={{ backgroundImage: "linear-gradient(0deg, rgba(2,8,16,.8), rgba(2,8,16,.08)), url('" + presetImageSource(preset) + "')" }} className={"flex h-20 items-end rounded-lg border bg-cover bg-center p-2 text-start text-[11px] font-semibold text-white " + (backgroundDraftPresetId === preset.id ? "border-cyan ring-2 ring-cyan/40" : "border-line")}>
                {lang === "ar" ? preset.labelAr : preset.labelEn}
              </button>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-line bg-navy p-3">
            <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold">{lang === "ar" ? "ضبط الصورة" : "Image framing"}</p><span className="text-[11px] text-muted">{Math.round(backgroundScale * 100)}%</span></div>
            <label className="mt-3 block text-xs text-muted">{lang === "ar" ? "تكبير / تصغير" : "Zoom / scale"}</label>
            <input aria-label={lang === "ar" ? "تكبير الخلفية" : "Background scale"} className="mt-1 w-full accent-cyan" type="range" min="1" max="2" step="0.05" value={backgroundScale} onChange={(e) => { setBackgroundScale(Number(e.target.value)); setBackgroundPreviewApproved(false); }} />
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div><label className="block text-xs text-muted">{lang === "ar" ? "تحريك أفقي" : "Horizontal position"}</label><input aria-label={lang === "ar" ? "تحريك الخلفية أفقياً" : "Horizontal image position"} className="mt-1 w-full accent-cyan" type="range" min="-50" max="50" step="1" value={backgroundX} onChange={(e) => { setBackgroundX(Number(e.target.value)); setBackgroundPreviewApproved(false); }} /></div>
              <div><label className="block text-xs text-muted">{lang === "ar" ? "تحريك عمودي" : "Vertical position"}</label><input aria-label={lang === "ar" ? "تحريك الخلفية عمودياً" : "Vertical image position"} className="mt-1 w-full accent-cyan" type="range" min="-50" max="50" step="1" value={backgroundY} onChange={(e) => { setBackgroundY(Number(e.target.value)); setBackgroundPreviewApproved(false); }} /></div>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" disabled={!backgroundDraftImage} onClick={() => { setBackgroundPreviewApproved(true); setBackgroundPreviewOpen(true); }} className="h-10 flex-1 rounded-lg border border-cyan/50 bg-cyan/10 text-xs font-semibold text-cyan disabled:opacity-40">{lang === "ar" ? "معاينة" : "Preview"}</button>
            <button type="button" disabled={!backgroundDraftImage || !backgroundPreviewApproved} onClick={applyLockBackground} className="h-10 flex-1 rounded-lg bg-cyan text-xs font-semibold text-night disabled:opacity-40">{lang === "ar" ? "تطبيق" : "Apply"}</button>
            <button type="button" onClick={resetLockBackground} className="h-10 rounded-lg border border-line px-3 text-xs">{lang === "ar" ? "افتراضية" : "Reset"}</button>
          </div>
          {backgroundPreviewOpen ? <div role="dialog" aria-modal="true" aria-label={lang === "ar" ? "معاينة خلفية القفل" : "Lock background preview"} className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4" onClick={() => setBackgroundPreviewOpen(false)}>
            <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-4" onClick={(event) => event.stopPropagation()}>
              <div className="mb-3 flex items-center justify-between gap-2"><h3 className="font-semibold">{lang === "ar" ? "معاينة على أبعاد الهاتف" : "Phone-sized preview"}</h3><button type="button" onClick={() => setBackgroundPreviewOpen(false)} className="grid size-9 place-items-center rounded-lg border border-line" aria-label={lang === "ar" ? "إغلاق المعاينة" : "Close preview"}>×</button></div>
              <div className="relative mx-auto aspect-[9/19] w-full max-w-[230px] overflow-hidden rounded-[2rem] border-[5px] border-black bg-mountains shadow-2xl">
                {backgroundDraftImage ? <img src={backgroundDraftImage} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: (50 + backgroundX) + "% " + (50 + backgroundY) + "%", transform: "scale(" + backgroundScale + ")" }} /> : null}
                <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/20 to-black/65" />
                <div className="relative z-10 flex h-full flex-col items-center justify-between px-4 py-8 text-center text-white">
                  <div><p className="text-xs opacity-80">9:41</p><p className="mt-2 text-2xl font-semibold">09:41</p><p className="mt-1 text-xs opacity-80">{lang === "ar" ? "أدخل رمز الحماية" : "Enter security PIN"}</p></div>
                  <div className="w-full"><div className="mb-5 flex justify-center gap-3">{[1,2,3,4].map((n) => <span key={n} className="size-2.5 rounded-full border border-white/70" />)}</div><div className="grid grid-cols-3 gap-2">{["1","2","3","4","5","6","7","8","9","•","0","⌫"].map((n) => <span key={n} className="rounded-full bg-white/15 py-2 text-sm backdrop-blur">{n}</span>)}</div></div>
                </div>
              </div>
              <p className="mt-3 text-center text-xs text-muted">{lang === "ar" ? "هذه معاينة للتصميم والقص؛ الحفظ لا يحدث حتى تضغط تطبيق." : "This previews the design and crop; nothing is saved until you press Apply."}</p>
              <button type="button" onClick={() => setBackgroundPreviewOpen(false)} className="mt-3 h-10 w-full rounded-lg border border-line text-sm">{lang === "ar" ? "رجوع للإعدادات" : "Back to settings"}</button>
            </div>
          </div> : null}
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
        <h2 className="text-sm font-semibold text-cyan">{lang === "ar" ? "بيئة Kiosk المستقلة" : "Standalone Kiosk environment"}</h2>
        <p className="mt-2 text-xs leading-relaxed text-muted">{lang === "ar" ? "إعدادات وتصميم منفصلان عن قفل الشاشة، مع شاشة رئيسية شبيهة بالهاتف وقائمة تطبيقات مسموحة. القيود الفعلية في أندرويد تتطلب أن يكون التطبيق مالك الجهاز." : "Separate from the lock screen, with a phone-like launcher and an allowlist. Actual Android restrictions require Device Owner provisioning."}</p>
        <p className={`mt-2 text-xs ${deviceOwner ? "text-success" : "text-muted"}`}>{deviceOwner ? (lang === "ar" ? "إدارة الجهاز: مفعّلة" : "Device management: active") : (lang === "ar" ? "إدارة الجهاز: غير مفعّلة" : "Device management: not active")}</p>
        <button type="button" onClick={() => setPanel("kiosk")} className="mt-3 h-11 w-full rounded-lg bg-cyan text-sm font-semibold text-night">{lang === "ar" ? "فتح إعدادات وواجهة Kiosk" : "Open Kiosk setup and launcher"}</button>
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

      <section className="rounded-xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold text-cyan">{lang === "ar" ? "تاريخ المحاولات الفاشلة المحلي والمشفّر" : "Local encrypted failed-attempt history"}</h2><button type="button" className="rounded-md border border-line px-3 py-2 text-xs" onClick={() => { void loadFailedAttemptHistory().then(setFailedHistory); }}>{lang === "ar" ? "تحديث" : "Refresh"}</button></div>
        <p className="mt-2 text-xs leading-5 text-muted">{lang === "ar" ? "يحفظ التطبيق وقت المحاولة واسم التطبيق وعدد المحاولات وطول الإدخال فقط داخل التخزين الآمن في أندرويد. الأرقام التي كتبتها محجوبة ولا تُخزّن إطلاقًا حتى لا يتحول سجل الحماية إلى سجل كلمات سر." : "Android secure storage keeps the time, app package, attempt count and entered length only. PIN digits are never logged."}</p>
        {failedHistory === null ? <p className="mt-3 text-xs text-muted">{lang === "ar" ? "السجل المشفّر متاح داخل نسخة أندرويد فقط." : "The encrypted journal is available only in the Android app."}</p> : failedHistory.length === 0 ? <p className="mt-3 text-xs text-muted">{lang === "ar" ? "لا توجد محاولات مسجلة." : "No attempts recorded."}</p> : <div className="mt-3 max-h-64 space-y-2 overflow-auto">{failedHistory.slice(-10).reverse().map((entry, index) => <div key={entry.at + "-" + entry.packageName + "-" + index} className="rounded-lg border border-line px-3 py-2"><p className="break-all text-xs font-semibold">{appName(lang, entry.packageName, installedApps)}</p><p className="mt-1 break-all text-[10px] text-muted">{entry.packageName}</p><p className="mt-1 text-[11px] text-muted">{new Date(entry.at).toLocaleString(lang === "ar" ? "ar" : "en-US")} · {lang === "ar" ? "المحاولة" : "Attempt"} {entry.attemptNumber} · {lang === "ar" ? "الإدخال: محجوب" : "Entered PIN: redacted"} ({entry.attemptedLength} {lang === "ar" ? "أرقام" : "digits"})</p><p className="mt-1 text-[11px] text-muted">{entry.context === "app" ? (lang === "ar" ? "سياق قفل تطبيق" : "App-lock context") : (lang === "ar" ? "سياق القفل الرئيسي" : "Main-lock context")} · {entry.outcome === "rate-limited" ? (lang === "ar" ? "تم تفعيل الإيقاف المؤقت" : "Rate limited") : (lang === "ar" ? "رمز غير صحيح" : "Rejected")}</p></div>)}</div>}
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
