import { readFile, writeFile } from "node:fs/promises";

const files = new Map();
async function load(path) { const text = await readFile(path, "utf8"); files.set(path, text); return text; }
async function save(path, text) { if (files.get(path) !== text) { await writeFile(path, text); files.set(path, text); console.log(`updated ${path}`); } }

// Emergency codes: first entry arms without counting as a failed PIN; a different
// PIN cancels the armed state; the second identical entry confirms the action.
{
  const path = "src/lib/store.ts";
  let s = await load(path);
  s = s.replace(
    'set({ armedEmergencyCode: emergencyCode, toast: get().lang === "ar" ? "الرمز خطأ" : "Wrong PIN" });\n          return "wrong";',
    'set({ armedEmergencyCode: emergencyCode, toast: get().lang === "ar" ? "الرمز خطأ" : "Wrong PIN" });\n          return "armed-emergency";'
  );
  await save(path, s);
}
{
  const path = "src/components/lock-gate.tsx";
  let s = await load(path);
  const needle = '    if (result === "duplicate") {\n      setValue("");\n      setToast(t.duplicatePin);\n      return;\n    }\n';
  const replacement = needle + '    if (result === "armed-emergency") {\n      setValue("");\n      setShake(true);\n      window.setTimeout(() => setShake(false), 350);\n      return;\n    }\n';
  if (!s.includes(replacement)) s = s.replace(needle, replacement);
  await save(path, s);
}

// Keep the UI wording truthful and compatible with the current Device Admin /
// Device Owner split. Device Admin itself requires deactivation before uninstall;
// Device Owner adds the stronger policy.
{
  const path = "src/components/settings-screen.tsx";
  let s = await load(path);
  s = s.replace(
    'disabled={!deviceOwner && !deviceAdmin && !preventUninstall}',
    'disabled={!deviceOwner && !preventUninstall}'
  );
  const old = 'ملاحظة الصلاحيات: منع الإزالة يعتمد على Device Owner فقط؛ لا تعوّضه صلاحيات Accessibility أو تجاهل تحسين البطارية أو Foreground Service. قفل التطبيقات يحتاج تفعيل Accessibility يدويًا من شاشة أندرويد. لا يستطيع التطبيق منح نفسه هذه الصلاحيات.';
  const replacement = 'ملاحظة الصلاحيات: منع الإزالة الصارم يعتمد على Device Owner؛ أما Device Admin فيتطلب تعطيله قبل إزالة التطبيق. الأذونات الإضافية لا تمنع الإزالة بحد ذاتها. لا تعوّضه صلاحيات Accessibility أو تجاهل تحسين البطارية أو Foreground Service. قفل التطبيقات يحتاج تفعيل Accessibility يدويًا من شاشة أندرويد. لا يستطيع التطبيق منح نفسه هذه الصلاحيات.';
  s = s.replace(old, replacement);
  await save(path, s);
}

// Restore the preset set expected by the lock-background feature.
{
  const path = "src/lib/background-presets.ts";
  let s = await load(path);
  if (!s.includes('id: "river-mountains"')) {
    const insert = `  {\n    id: "river-mountains",\n    labelAr: "جبال ونهر",\n    labelEn: "River mountains",\n    svg: svg(\`\n      <rect width="1400" height="900" fill="url(#sky)"/>\n      <path d="M0 620 250 280 470 560 690 210 920 560 1160 300 1400 610V900H0z" fill="#20394b"/>\n      <path d="M0 700 320 470 520 650 760 410 980 650 1240 450 1400 610V900H0z" fill="#0e2431"/>\n      <path d="M0 735q210-70 390 0t390 0 360 0 260 0v165H0z" fill="#07131d"/>\n      <path d="M510 900q150-170 300-190 120-18 270-90-90 105-30 170t-190 110z" fill="#28637a" opacity=".9"/>\n    \`, \`<linearGradient id="sky" x2="0" y2="1"><stop stop-color="#06152b"/><stop offset=".6" stop-color="#527b8d"/><stop offset="1" stop-color="#d39b78"/></linearGradient>\`),\n  },\n  {\n    id: "arabian-horses",\n    labelAr: "خيول عربية",\n    labelEn: "Arabian horses",\n    svg: svg(\`\n      <rect width="1400" height="900" fill="url(#sky)"/>\n      <circle cx="1060" cy="220" r="115" fill="#f6d99d" opacity=".82"/>\n      <path d="M0 720q260-180 520-20t460-25 420 20v205H0z" fill="#151319"/>\n      <g fill="#08090d"><path d="M420 700q-12-180 92-250 82-55 160-20l45 65-38 24-78-35-42 56 42 65 30 95z"/><path d="M760 710q-8-155 86-226 70-52 144-18l54 58-38 31-80-30-45 54 34 58 38 73z"/></g>\n      <path d="M0 810q260-70 520 5t480 0 400 0v85H0z" fill="#090b10"/>\n    \`, \`<linearGradient id="sky" x2="0" y2="1"><stop stop-color="#080d1a"/><stop offset=".55" stop-color="#6b4a4c"/><stop offset="1" stop-color="#d39b72"/></linearGradient>\`),\n  },\n  {\n    id: "night-riders",\n    labelAr: "فرسان الليل",\n    labelEn: "Night riders",\n    svg: svg(\`\n      <rect width="1400" height="900" fill="#040914"/>\n      <circle cx="1060" cy="190" r="95" fill="#dbe8e5" opacity=".9"/>\n      <g fill="none" stroke="#365d68" stroke-width="4" opacity=".75"><path d="M0 690h1400"/><path d="M150 690q170-250 340 0t340 0 340 0"/></g>\n      <g fill="#06090f"><path d="M210 700q-10-150 75-210 68-48 132-12l44 52-34 29-72-30-34 48 36 55 30 68z"/><path d="M850 700q-10-145 78-208 62-45 126-13l44 50-32 30-72-31-37 48 35 55 31 69z"/></g>\n      <g fill="#a9d6d9" opacity=".6"><circle cx="150" cy="170" r="3"/><circle cx="330" cy="90" r="2"/><circle cx="580" cy="180" r="3"/><circle cx="820" cy="75" r="2"/><circle cx="1260" cy="330" r="3"/></g>\n    \`),\n  },\n`;
    s = s.replace('];\n', insert + '];\n');
  }
  await save(path, s);
}
