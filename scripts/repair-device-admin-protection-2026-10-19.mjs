import { readFile, writeFile } from "node:fs/promises";
const path = "src/lib/store.ts";
let source = await readFile(path, "utf8");
const statusOld = 'autostartPermission: status.autostartPermission, deviceAdmin: status.deviceAdmin, deviceSecure: status.deviceSecure, preventUninstall: status.preventUninstall, dedicatedDeviceMode: status.dedicatedDeviceMode, deviceOwner: status.deviceOwner });';
const statusNew = 'autostartPermission: status.autostartPermission, deviceAdmin: status.deviceAdmin, deviceSecure: status.deviceSecure, preventUninstall: status.preventUninstall || status.deviceAdmin, dedicatedDeviceMode: status.dedicatedDeviceMode, deviceOwner: status.deviceOwner });';
if (source.includes(statusOld)) source = source.replace(statusOld, statusNew);
const old = '        if (action.type === "toggle-prevent") void nativeBridge.setSelfUninstallBlocked(action.value).then(async (ok) => {\n          await get().refreshNativePermissions();';
if (!source.includes(old)) {
  console.log("Device Admin protection is already repaired; no changes needed.");
  process.exit(0);
}
const replacement = `        if (action.type === "toggle-prevent") {\n          const current = get();\n          if (current.deviceAdmin && !current.deviceOwner) {\n            if (!action.value) {\n              set({ toast: current.lang === "ar" ? "لإيقاف حماية الإزالة يجب أولًا إلغاء مسؤول الجهاز من إعدادات أندرويد." : "To disable uninstall protection, first deactivate Device Admin in Android Settings." });\n              return;\n            }\n            set({ preventUninstall: true });\n            return;\n          }\n          void nativeBridge.setSelfUninstallBlocked(action.value).then(async (ok) => {\n          await get().refreshNativePermissions();`;
source = source.replace(old, replacement);
const closing = `        });\n        if (action.type === "toggle-kiosk")`;
if (source.includes(closing)) source = source.replace(closing, `          });\n        }\n        if (action.type === "toggle-kiosk")`);
await writeFile(path, source);
console.log("Device Admin uninstall protection semantics repaired.");
