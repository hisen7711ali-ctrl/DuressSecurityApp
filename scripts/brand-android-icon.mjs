import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const androidDir = path.join(root, "android");
const drawableDir = path.join(androidDir, "app/src/main/res/drawable");
const manifestPath = path.join(androidDir, "app/src/main/AndroidManifest.xml");

await mkdir(drawableDir, { recursive: true });

// Neutral calculator-style icon: matches the public calculator surface without
// exposing the protected/security workspace from the launcher icon.
const iconXml = `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
    <path android:fillColor="#0B132B" android:pathData="M18,6h72c8,0 12,4 12,12v72c0,8 -4,12 -12,12H18c-8,0 -12,-4 -12,-12V18C6,10 10,6 18,6Z"/>
    <path android:fillColor="#18C7D9" android:pathData="M25,17h58c5,0 8,3 8,8v58c0,5 -3,8 -8,8H25c-5,0 -8,-3 -8,-8V25c0,-5 3,-8 8,-8Z"/>
    <path android:fillColor="#F7FAFC" android:pathData="M27,27h54v17H27Z"/>
    <path android:fillColor="#0B132B" android:pathData="M29,49h12v12H29Z M48,49h12v12H48Z M67,49h12v12H67Z M29,66h12v12H29Z M48,66h12v12H48Z M67,66h12v12H67Z"/>
</vector>`;

await writeFile(path.join(drawableDir, "ic_launcher.xml"), iconXml, "utf8");
await writeFile(path.join(drawableDir, "ic_launcher_round.xml"), iconXml, "utf8");

let manifest = await readFile(manifestPath, "utf8");
manifest = manifest.replace(/<application\b([^>]*)>/, (_, attrs0) => {
  let attrs = attrs0;
  const set = (name, value) => {
    const re = new RegExp(`android:${name}\\s*=\\s*"[^"]*"`);
    attrs = re.test(attrs) ? attrs.replace(re, `android:${name}="${value}"`) : `${attrs} android:${name}="${value}"`;
  };
  set("icon", "@drawable/ic_launcher");
  set("roundIcon", "@drawable/ic_launcher_round");
  return `<application${attrs}>`;
});
await writeFile(manifestPath, manifest, "utf8");
console.log("Android launcher icon updated to neutral calculator branding.");
