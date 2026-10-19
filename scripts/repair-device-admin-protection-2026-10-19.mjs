import { readFile, writeFile } from "node:fs/promises";
const path = "src/lib/store.ts";
let source = await readFile(path, "utf8");
source = source.replace(
  'autostartPermission: status.autostartPermission, deviceAdmin: status.deviceAdmin, deviceSecure: status.deviceSecure, preventUninstall: status.preventUninstall, dedicatedDeviceMode: status.dedicatedDeviceMode, deviceOwner: status.deviceOwner });',
  'autostartPermission: status.autostartPermission, deviceAdmin: status.deviceAdmin, deviceSecure: status.deviceSecure, preventUninstall: status.preventUninstall || status.deviceAdmin, dedicatedDeviceMode: status.dedicatedDeviceMode, deviceOwner: status.deviceOwner });'
);
const old = '        if (action.type === "toggle-prevent") void nativeBridge.setSelfUninstallBlocked(action.value).then(async (ok) => {\n          await get().refreshNativePermissions();';
const replacement = `        if (action.type === "toggle-prevent") {\n          const current = get();\n          // Device Admin already protects its own uninstall path: Android requires\n          // the administrator to be unregistered before the app can be removed.\n          // Only Device Owner can add the stronger silent/hard uninstall block.\n          if (current.deviceAdmin && !current.deviceOwner) {\n            if (!action.value) {\n              set({ toast: current.lang === "ar" ? "لإيقاف حماية الإزالة يجب أولًا إلغاء مسؤول الجهاز من إعدادات أندرويد." : "To disable uninstall protection, first deactivate Device Admin in Android Settings." });\n              return;\n            }\n            set({ preventUninstall: true });\n            return;\n          }\n          void nativeBridge.setSelfUninstallBlocked(action.value).then(async (ok) => {\n          await get().refreshNativePermissions();`;
if (!source.includes(old)) throw new Error("toggle-prevent block not found");
source = source.replace(old, replacement);
const closing = `        });\n        if (action.type === "toggle-kiosk")`;
if (!source.includes(closing)) throw new Error("toggle-prevent closing block not found");
source = source.replace(closing, `          });\n        }\n        if (action.type === "toggle-kiosk")`);
await writeFile(path, source);
console.log("Device Admin uninstall protection semantics repaired.");
