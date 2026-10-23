import fs from "node:fs";

const path = "src/components/settings-screen.tsx";
const source = fs.readFileSync(path, "utf8");

if (source.includes("const uninstallHint =")) {
  console.log("settings-screen.tsx already contains the TypeScript repair.");
  process.exit(0);
}

const lines = source.split("\n");
const toggleIndex = lines.findIndex((line) => line.includes('<ToggleRow label={lang === "ar" ? "منع الإزالة"'));
if (toggleIndex < 0) {
  console.log("No malformed uninstall ToggleRow found; nothing to repair.");
  process.exit(0);
}

const returnIndex = lines.findIndex((line) => line.trim() === "return (");
if (returnIndex < 0) throw new Error("Could not find SettingsScreen return block.");

const helper = [
  "  const uninstallHint = preventUninstall",
  "    ? deviceOwner",
  "      ? (lang === \"ar\" ? \"منع الإزالة الصارم مفعّل بواسطة Device Owner.\" : \"Hard uninstall blocking is active through Device Owner.\")",
  "      : (lang === \"ar\" ? \"الحماية مرتبطة بمسؤول الجهاز: يجب تعطيل مسؤول الجهاز قبل إزالة التطبيق.\" : \"Device Admin protection is active: Android requires the administrator to be disabled before uninstalling.\")",
  "    : !deviceOwner && !deviceAdmin",
  "      ? (lang === \"ar\" ? \"فعّل مسؤول الجهاز أو أعدد التطبيق كمالك للجهاز. مسؤول الجهاز يحمي التطبيق من الإزالة إلى أن يُلغى تفعيله؛ وDevice Owner يضيف منع الإزالة الصارم.\" : \"Enable Device Admin or provision the app as Device Owner. Device Admin requires deactivation before uninstall; Device Owner adds hard uninstall blocking.\")",
  "      : deviceOwner",
  "        ? (lang === \"ar\" ? \"مالك الجهاز مفعّل؛ يمكنك تفعيل منع الإزالة الصارم.\" : \"Device Owner is active; hard uninstall blocking can be enabled.\")",
  "        : (lang === \"ar\" ? \"مسؤول الجهاز مفعّل؛ ستتطلب إزالة التطبيق تعطيل مسؤول الجهاز أولًا.\" : \"Device Admin is active; uninstall requires disabling the administrator first.\");",
];

lines.splice(returnIndex, 0, ...helper);
const adjustedToggleIndex = toggleIndex + helper.length;
lines[adjustedToggleIndex] = '      <ToggleRow label={lang === "ar" ? "منع الإزالة" : "Block uninstall"} hint={uninstallHint} on={preventUninstall} disabled={!deviceOwner && !preventUninstall} onToggle={(value) => openOverlay({ kind: "confirm", action: { type: "toggle-prevent", value }, title: t.enterMasterConfirm })} />';

fs.writeFileSync(path, lines.join("\n"));
console.log("Repaired settings-screen.tsx uninstall hint expression.");
