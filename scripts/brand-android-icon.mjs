import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const androidDir = path.join(root, "android");
const drawableDir = path.join(androidDir, "app/src/main/res/drawable");
const mipmapDir = path.join(androidDir, "app/src/main/res/mipmap-anydpi-v26");
const manifestPath = path.join(androidDir, "app/src/main/AndroidManifest.xml");

await mkdir(drawableDir, { recursive: true });
await mkdir(mipmapDir, { recursive: true });

// Premium, neutral launcher identity: an abstract monogram/shield mark rather
// than a literal calculator or security label. Adaptive icons use separate
// foreground/background layers and a monochrome layer for modern launchers.
const legacyIcon = `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
    <path android:fillColor="#0A1224" android:pathData="M18,6h72c8,0 12,4 12,12v72c0,8 -4,12 -12,12H18c-8,0 -12,-4 -12,-12V18C6,10 10,6 18,6Z"/>
    <path android:fillColor="#23C7D9" android:pathData="M54,16l29,11v23c0,18 -11,32 -29,42C36,82 25,68 25,50V27Z"/>
    <path android:fillColor="#F8FAFC" android:pathData="M43,35h18c10,0 17,7 17,17s-7,17 -17,17H43V35Zm10,9v16h7c5,0 8,-3 8,-8s-3,-8 -8,-8H53Z"/>
</vector>`;

const background = `<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle"><solid android:color="#0A1224"/></shape>`;
const foreground = `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
    <path android:fillColor="#23C7D9" android:pathData="M54,16l29,11v23c0,18 -11,32 -29,42C36,82 25,68 25,50V27Z"/>
    <path android:fillColor="#F8FAFC" android:pathData="M43,35h18c10,0 17,7 17,17s-7,17 -17,17H43V35Zm10,9v16h7c5,0 8,-3 8,-8s-3,-8 -8,-8H53Z"/>
</vector>`;
const monochrome = `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
    <path android:fillColor="#FFFFFF" android:pathData="M54,16l29,11v23c0,18 -11,32 -29,42C36,82 25,68 25,50V27Z"/>
    <path android:fillColor="#000000" android:pathData="M43,35h18c10,0 17,7 17,17s-7,17 -17,17H43V35Zm10,9v16h7c5,0 8,-3 8,-8s-3,-8 -8,-8H53Z"/>
</vector>`;

await writeFile(path.join(drawableDir, "ic_launcher.xml"), legacyIcon, "utf8");
await writeFile(path.join(drawableDir, "ic_launcher_round.xml"), legacyIcon, "utf8");
await writeFile(path.join(drawableDir, "ic_launcher_background.xml"), background, "utf8");
await writeFile(path.join(drawableDir, "ic_launcher_foreground.xml"), foreground, "utf8");
await writeFile(path.join(drawableDir, "ic_launcher_monochrome.xml"), monochrome, "utf8");

const adaptive = `<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@drawable/ic_launcher_background" />\n    <foreground android:drawable="@drawable/ic_launcher_foreground" />\n    <monochrome android:drawable="@drawable/ic_launcher_monochrome" />\n</adaptive-icon>\n`;
await writeFile(path.join(mipmapDir, "ic_launcher.xml"), adaptive, "utf8");
await writeFile(path.join(mipmapDir, "ic_launcher_round.xml"), adaptive, "utf8");

let manifest = await readFile(manifestPath, "utf8");
manifest = manifest.replace(/<application\b([^>]*)>/, (_, attrs0) => {
  let attrs = attrs0;
  const set = (name, value) => {
    const re = new RegExp(`android:${name}\\s*=\\s*"[^"]*"`);
    attrs = re.test(attrs) ? attrs.replace(re, `android:${name}="${value}"`) : `${attrs} android:${name}="${value}"`;
  };
  set("icon", "@mipmap/ic_launcher");
  set("roundIcon", "@mipmap/ic_launcher_round");
  return `<application${attrs}>`;
});
await writeFile(manifestPath, manifest, "utf8");
console.log("Android launcher icon updated to premium adaptive branding.");
