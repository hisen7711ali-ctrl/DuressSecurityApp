import { readFile, writeFile } from "node:fs/promises";

const patches = [];

async function patch(path, transform) {
  const before = await readFile(path, "utf8");
  const after = transform(before);
  if (after === before) return false;
  await writeFile(path, after);
  patches.push(path);
  return true;
}

await patch("src/lib/store.ts", (source) => {
  let out = source;
  out = out.replace(
    'type TransientSlice = { ready: boolean; session: SessionMode; storageErrorCode: string | null; tab: TabId;',
    'type TransientSlice = { ready: boolean; session: SessionMode; storageErrorCode: string | null; armedEmergencyCode: "7777" | "8888" | null; tab: TabId;'
  );
  out = out.replace(
    'ready: false, session: "locked", storageErrorCode: null, tab: "home",',
    'ready: false, session: "locked", storageErrorCode: null, armedEmergencyCode: null, tab: "home",'
  );
  const old = `        const action = serviceClassifyPin(pin, state.pins);\n        if (action === "wipe") {\n          // A destructive reset is never a consequence of typing a PIN alone.\n          // The owner must enter Settings, pass the master-PIN confirmation,\n          // and acknowledge the separate app-owned reset screen.\n          set({ toast: get().lang === "ar"\n            ? "7777 لا يبدأ المسح من لوحة القفل. افتح إجراء الطوارئ من الإعدادات بتأكيد المالك."\n            : "7777 cannot start a wipe from a lock keypad. Open the owner-confirmed emergency action in Settings." });\n          return "wipe";\n        }`;
  const replacement = `        const typedEmergency = normalizePin(pin);\n        const emergencyCode = typedEmergency === "7777" ? "7777" : typedEmergency === "8888" ? "8888" : null;\n        if (emergencyCode) {\n          if (state.armedEmergencyCode === emergencyCode) {\n            // The second identical entry is the owner's confirmation. Clear the\n            // armed state before continuing so a third entry cannot repeat it.\n            set({ armedEmergencyCode: null });\n            if (emergencyCode === "7777") {\n              // Keep the existing wipe action routing; the native destructive\n              // operation remains separately gated by Android capabilities.\n              return "wipe";\n            }\n            // 8888 is an emergency confirmation code as well. It never unlocks\n            // the normal session after the owner has armed the emergency action.\n            return "wipe";\n          }\n          // First entry deliberately looks like a normal wrong PIN while arming\n          // the emergency action. This prevents the special code from being\n          // disclosed by the keypad UI.\n          set({ armedEmergencyCode: emergencyCode, toast: get().lang === "ar" ? "الرمز خطأ" : "Wrong PIN" });\n          return "wrong";\n        }\n        if (state.armedEmergencyCode) set({ armedEmergencyCode: null });\n        const action = serviceClassifyPin(pin, state.pins);\n        if (action === "wipe") {\n          set({ toast: get().lang === "ar"\n            ? "7777: أعد إدخال الرمز لتأكيد إجراء المالك."\n            : "7777: enter the code again to confirm the owner action." });\n          return "wipe";\n        }`;
  if (!out.includes(old)) throw new Error("store emergency block not found");
  out = out.replace(old, replacement);
  return out;
});

await patch("src/components/lock-gate.tsx", (source) => {
  const old = `    // Never trigger the app-owned wipe PIN at a screen whose context is itself a lock UI.\n    // Cross-app data removal cannot be silently invoked from this keypad.\n    if (current?.kind !== "set-pin" && normalizePin(pin) === normalizePin(useAppStore.getState().pins.format)) {\n      setValue("");\n      setToast(current?.kind === "app"\n        ? (lang === "ar" ? "تم رفض المسح التلقائي. تم الحفاظ على القفل؛ مسح بيانات التطبيق المستهدف يتطلب إجراءً صريحًا من إعدادات أندرويد." : "Automatic wiping is blocked. The lock remains active; clearing the target app requires an explicit Android Settings action.")\n        : (lang === "ar" ? "7777 لا يمسح بيانات تطبيق الحماية من قفله الرئيسي." : "7777 does not erase the security app from its own main lock."));\n      return;\n    }\n`;
  if (!source.includes(old)) throw new Error("lock-gate emergency block not found");
  return source.replace(old, "");
});

await patch("src/components/settings-screen.tsx", (source) => {
  let out = source;
  out = out.replace(
    `          hint={preventUninstall\n            ? (lang === "ar" ? "سياسة منع الإزالة مفعّلة على مستوى أندرويد." : "Android uninstall-block policy is active on this device.")\n            : !deviceOwner\n              ? (lang === "ar"\n                ? "غير مدعوم بعد: يلزم إعداد رسمي كمالك الجهاز (Device Owner). مسؤول الجهاز العادي والأذونات الإضافية لا تمنع الإزالة. للاختبار فقط على محاكي جديد ونظيف بعد تثبيت التطبيق: adb shell dpm set-device-owner com.duresssecurity.app/com.duresssecurity.admin.AdminReceiver أو استخدم QR Provisioning رسميًا. لا تنفّذ الأمر على هاتفك الأساسي؛ قد يفشل إذا كان الجهاز مُعدًا بالفعل."\n                : "Not supported yet: formal Device Owner provisioning is required. Device Admin and extra permissions cannot block uninstall. Use a clean dedicated test emulator with official provisioning or adb dpm; do not run it on your primary phone.")\n              : (lang === "ar" ? "مالك الجهاز مفعّل، لكن أندرويد لم يؤكد سياسة منع الإزالة بعد." : "Device Owner is active, but Android has not confirmed the uninstall-block policy yet")}\n          on={preventUninstall}\n          disabled={!deviceOwner && !preventUninstall}`,
    `          hint={preventUninstall\n            ? (deviceOwner\n              ? (lang === "ar" ? "منع الإزالة الصارم مفعّل بواسطة Device Owner." : "Hard uninstall blocking is active through Device Owner.")\n              : (lang === "ar" ? "الحماية مرتبطة بمسؤول الجهاز: يجب تعطيل مسؤول الجهاز قبل إزالة التطبيق." : "Device Admin protection is active: Android requires the administrator to be disabled before uninstalling."))\n            : (!deviceOwner && !deviceAdmin)\n              ? (lang === "ar"\n                ? "فعّل مسؤول الجهاز أو أعدد التطبيق كمالك للجهاز. مسؤول الجهاز يمنع الإزالة إلى أن يُلغى تفعيله؛ وDevice Owner يضيف منع الإزالة الصارم."\n                : "Enable Device Admin or provision the app as Device Owner. Device Admin requires deactivation before uninstall; Device Owner adds hard uninstall blocking.")\n              : deviceOwner\n                ? (lang === "ar" ? "مالك الجهاز مفعّل؛ يمكنك تفعيل منع الإزالة الصارم." : "Device Owner is active; hard uninstall blocking can be enabled.")\n                : (lang === "ar" ? "مسؤول الجهاز مفعّل؛ ستتطلب إزالة التطبيق تعطيل مسؤول الجهاز أولًا." : "Device Admin is active; uninstall requires disabling the administrator first."))}\n          on={preventUninstall}\n          disabled={!deviceOwner && !deviceAdmin && !preventUninstall}`
  );
  out = out.replace(
    `              : !state.deviceOwner\n                ? (state.lang === "ar" ? "لم يُفعّل منع الإزالة: يجب إعداد التطبيق كمالك الجهاز (Device Owner). صلاحية مسؤول الجهاز وحدها لا تكفي." : "Uninstall protection was not enabled: this app must be provisioned as Device Owner. Device Admin alone is not enough.")\n                : (state.lang === "ar" ? "أندرويد لم يؤكد تفعيل سياسة منع الإزالة؛ لم يتم تفعيلها." : "Android did not confirm the uninstall-block policy; it was not enabled.")`,
    `              : !state.deviceOwner && state.deviceAdmin\n                ? (state.lang === "ar" ? "مسؤول الجهاز مفعّل، لكن منع الإزالة الصارم يحتاج Device Owner. سيبقى التطبيق محميًا من الإزالة إلى أن يُعطّل مسؤول الجهاز." : "Device Admin is active, but hard uninstall blocking requires Device Owner. Android will require the administrator to be disabled before uninstall.")\n                : !state.deviceOwner\n                  ? (state.lang === "ar" ? "فعّل مسؤول الجهاز أو أعدد التطبيق كمالك للجهاز أولًا." : "Enable Device Admin or provision the app as Device Owner first.")\n                  : (state.lang === "ar" ? "أندرويد لم يؤكد تفعيل سياسة منع الإزالة؛ لم يتم تفعيلها." : "Android did not confirm the uninstall-block policy; it was not enabled.")`
  );
  return out;
});

if (patches.length === 0) {
  console.log("Security flow is already repaired; no files changed.");
  process.exit(0);
}
console.log(`Patched: ${patches.join(", ")}`);
