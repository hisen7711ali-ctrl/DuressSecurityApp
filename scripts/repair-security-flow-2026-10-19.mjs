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
  if (!out.includes(old)) return out;
  const replacement = `        const typedEmergency = normalizePin(pin);\n        const emergencyCode = typedEmergency === "7777" ? "7777" : typedEmergency === "8888" ? "8888" : null;\n        if (emergencyCode) {\n          if (state.armedEmergencyCode === emergencyCode) {\n            set({ armedEmergencyCode: null });\n            return "wipe";\n          }\n          set({ armedEmergencyCode: emergencyCode, toast: get().lang === "ar" ? "الرمز خطأ" : "Wrong PIN" });\n          return "armed-emergency";\n        }\n        if (state.armedEmergencyCode) set({ armedEmergencyCode: null });\n        const action = serviceClassifyPin(pin, state.pins);\n        if (action === "wipe") {\n          set({ toast: get().lang === "ar"\n            ? "7777: أعد إدخال الرمز لتأكيد إجراء المالك."\n            : "7777: enter the code again to confirm the owner action." });\n          return "wipe";\n        }`;
  return out.replace(old, replacement);
});

await patch("src/components/lock-gate.tsx", (source) => {
  const old = `    // Never trigger the app-owned wipe PIN at a screen whose context is itself a lock UI.\n    // Cross-app data removal cannot be silently invoked from this keypad.\n    if (current?.kind !== "set-pin" && normalizePin(pin) === normalizePin(useAppStore.getState().pins.format)) {\n      setValue("");\n      setToast(current?.kind === "app"\n        ? (lang === "ar" ? "تم رفض المسح التلقائي. تم الحفاظ على القفل؛ مسح بيانات التطبيق المستهدف يتطلب إجراءً صريحاً من إعدادات أندرويد." : "Automatic wiping is blocked. The lock remains active; clearing the target app requires an explicit Android Settings action.")\n        : (lang === "ar" ? "7777 لا يمسح بيانات تطبيق الحماية من قفله الرئيسي." : "7777 does not erase the security app from its own main lock."));\n      return;\n    }\n`;
  if (!source.includes(old)) return source;
  return source.replace(old, "");
});

await patch("src/components/settings-screen.tsx", (source) => {
  let out = source;
  out = out.replace('disabled={!deviceOwner && !deviceAdmin && !preventUninstall}', 'disabled={!deviceOwner && !preventUninstall}');
  return out;
});

if (patches.length === 0) {
  console.log("Security flow is already repaired; no files changed.");
  process.exit(0);
}
console.log(`Patched: ${patches.join(", ")}`);
