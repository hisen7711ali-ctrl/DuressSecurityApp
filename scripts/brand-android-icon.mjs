import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const androidDir = path.join(root, "android");
const drawableDir = path.join(androidDir, "app/src/main/res/drawable");
const manifestPath = path.join(androidDir, "app/src/main/AndroidManifest.xml");

await mkdir(drawableDir, { recursive: true });

// Use a single Android VectorDrawable as the final launcher source. This is
// deliberately simpler than the previous adaptive-icon chain so Android 8/9
// launchers cannot fall back to the generic Android robot when a mipmap layer
// is missing or rejected. The mark is a clean DS/security monogram, not a
// literal calculator icon.
const icon = `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
    <path android:fillColor="#081426" android:pathData="M20,4h68c10,0 16,6 16,16v68c0,10 -6,16 -16,16H20C10,104 4,98 4,88V20C4,10 10,4 20,4Z"/>
    <path android:fillColor="#23C7D9" android:pathData="M54,16l29,12v21c0,18 -11,32 -29,42C36,81 25,67 25,49V28Z"/>
    <path android:fillColor="#F8FAFC" android:pathData="M39,34h21c10,0 18,8 18,18s-8,18 -18,18H39V34Zm11,9v18h9c5,0 9,-4 9,-9s-4,-9 -9,-9H50Z"/>
    <path android:fillColor="#23C7D9" android:pathData="M39,34h10v36H39z"/>
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
console.log("Android launcher icon finalized as a reliable professional VectorDrawable.");
