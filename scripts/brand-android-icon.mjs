import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const androidDir = path.join(root, "android");
const drawableDir = path.join(androidDir, "app/src/main/res/drawable");
const manifestPath = path.join(androidDir, "app/src/main/AndroidManifest.xml");

await mkdir(drawableDir, { recursive: true });

// The launcher must visually match the public decoy: a calculator. Keep this as
// one reliable VectorDrawable so Android 8/9 launchers cannot fall back to the
// generic Android robot or an unrelated security/shield mark.
const icon = `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
    <!-- rounded calculator body -->
    <path android:fillColor="#0B172A" android:pathData="M22,4h64c12,0 18,6 18,18v64c0,12 -6,18 -18,18H22C10,104 4,98 4,86V22C4,10 10,4 22,4Z"/>
    <!-- calculator bezel -->
    <path android:fillColor="#162B45" android:pathData="M25,13h58c7,0 12,5 12,12v58c0,7 -5,12 -12,12H25c-7,0 -12,-5 -12,-12V25c0,-7 5,-12 12,-12Z"/>
    <!-- display -->
    <path android:fillColor="#07111F" android:pathData="M25,22h58c3,0 5,2 5,5v15c0,3 -2,5 -5,5H25c-3,0 -5,-2 -5,-5V27c0,-3 2,-5 5,-5Z"/>
    <path android:fillColor="#23C7D9" android:pathData="M29,27h48c2,0 3,1 3,3v5H29c-2,0 -3,-1 -3,-3v-2c0,-2 1,-3 3,-3Z"/>
    <!-- calculator keys -->
    <path android:fillColor="#F8FAFC" android:pathData="M25,54h10c3,0 5,2 5,5v5c0,3 -2,5 -5,5H25c-3,0 -5,-2 -5,-5v-5c0,-3 2,-5 5,-5Z"/>
    <path android:fillColor="#F8FAFC" android:pathData="M49,54h10c3,0 5,2 5,5v5c0,3 -2,5 -5,5H49c-3,0 -5,-2 -5,-5v-5c0,-3 2,-5 5,-5Z"/>
    <path android:fillColor="#23C7D9" android:pathData="M73,54h10c3,0 5,2 5,5v5c0,3 -2,5 -5,5H73c-3,0 -5,-2 -5,-5v-5c0,-3 2,-5 5,-5Z"/>
    <path android:fillColor="#F8FAFC" android:pathData="M25,73h10c3,0 5,2 5,5v5c0,3 -2,5 -5,5H25c-3,0 -5,-2 -5,-5v-5c0,-3 2,-5 5,-5Z"/>
    <path android:fillColor="#F8FAFC" android:pathData="M49,73h10c3,0 5,2 5,5v5c0,3 -2,5 -5,5H49c-3,0 -5,-2 -5,-5v-5c0,-3 2,-5 5,-5Z"/>
    <path android:fillColor="#23C7D9" android:pathData="M73,73h10c3,0 5,2 5,5v5c0,3 -2,5 -5,5H73c-3,0 -5,-2 -5,-5v-5c0,-3 2,-5 5,-5Z"/>
</vector>`;

await writeFile(path.join(drawableDir, "ic_launcher.xml"), icon, "utf8");
await writeFile(path.join(drawableDir, "ic_launcher_round.xml"), icon, "utf8");

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
console.log("Android launcher icon finalized as a calculator VectorDrawable.");
