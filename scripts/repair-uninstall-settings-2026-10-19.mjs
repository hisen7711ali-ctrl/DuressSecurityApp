import { readFile, writeFile } from "node:fs/promises";
const path = "src/components/settings-screen.tsx";
let source = await readFile(path, "utf8");
const pattern = /\s{10}hint=\{preventUninstall[\s\S]*?\n          disabled=\{!deviceOwner && !preventUninstall\}/;
const replacement = `          hint={preventUninstall
            ? (deviceOwner
              ? (lang === "ar" ? "منع الإزالة الصارم مفعّل بواسطة Device Owner." : "Hard uninstall blocking is active through Device Owner.")
              : (lang === "ar" ? "الحماية مرتبطة بمسؤول الجهاز: يجب تعطيل مسؤول الجهاز قبل إزالة التطبيق." : "Device Admin protection is active: Android requires the administrator to be disabled before uninstalling."))
            : (!deviceOwner && !deviceAdmin)
              ? (lang === "ar" ? "فعّل مسؤول الجهاز أو أعدد التطبيق كمالك للجهاز. مسؤول الجهاز يحمي التطبيق من الإزالة إلى أن يُلغى تفعيله؛ وDevice Owner يضيف منع الإزالة الصارم." : "Enable Device Admin or provision the app as Device Owner. Device Admin requires deactivation before uninstall; Device Owner adds hard uninstall blocking.")
              : deviceOwner
                ? (lang === "ar" ? "مالك الجهاز مفعّل؛ يمكنك تفعيل منع الإزالة الصارم." : "Device Owner is active; hard uninstall blocking can be enabled.")
                : (lang === "ar" ? "مسؤول الجهاز مفعّل؛ ستتطلب إزالة التطبيق تعطيل مسؤول الجهاز أولًا." : "Device Admin is active; uninstall requires disabling the administrator first."))}
          on={preventUninstall}
          disabled={!deviceOwner && !deviceAdmin && !preventUninstall}`;
if (!pattern.test(source)) {
  console.log("Uninstall settings are already repaired; no changes needed.");
  process.exit(0);
}
source = source.replace(pattern, replacement);
await writeFile(path, source);
console.log("Updated uninstall protection UI for Device Admin and Device Owner.");
