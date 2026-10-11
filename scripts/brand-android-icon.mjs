import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const androidDir = path.join(root, "android");
const drawableDir = path.join(androidDir, "app/src/main/res/drawable");
const manifestPath = path.join(androidDir, "app/src/main/AndroidManifest.xml");

await mkdir(drawableDir, { recursive: true });

// Security-first launcher mark: shield + keyhole, deliberately different from
// the calculator disguise shown inside the app.
const iconXml = `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
    <path android:fillColor="#0B132B" android:pathData="M54,5C54,5 94,17 94,17V48C94,74 78,92 54,102C30,92 14,74 14,48V17Z"/>
    <path android:fillColor="#18C7D9" android:pathData="M54,13C54,13 86,23 86,23V48C86,68 72,83 54,92C36,83 22,68 22,48V23Z"/>
    <path android:fillColor="#F7FAFC" android:pathData="M54,30C47.4,30 42,35.4 42,42C42,45.7 43.7,49 46.4,51.2V69C46.4,71 48,72.6 50,72.6H58C60,72.6 61.6,71 61.6,69V51.2C64.3,49 66,45.7 66,42C66,35.4 60.6,30 54,30ZM54,36.5C57.1,36.5 59.5,39 59.5,42C59.5,45.1 57.1,47.5 54,47.5C50.9,47.5 48.5,45.1 48.5,42C48.5,39 50.9,36.5 54,36.5Z"/>
</vector>`;

await writeFile(path.join(drawableDir, "ic_launcher.xml"), iconXml, "utf8");
await writeFile(path.join(drawableDir, "ic_launcher_round.xml"), iconXml, "utf8");

let manifest = await readFile(manifestPath, "utf8");
manifest = manifest.replace(/<application\\b([^>]*)>/, (_, attrs0) => {
    let attrs = attrs0;
    const set = (name, value) => {
        const re = new RegExp(`android:${name}\\\\s*=\\\\s*"[^"]*"`);
        attrs = re.test(attrs) ? attrs.replace(re, `android:${name}="${value}"`) : `${attrs} android:${name}="${value}"`;
    };
    set("icon", "@drawable/ic_launcher");
    set("roundIcon", "@drawable/ic_launcher_round");
    return `<application${attrs}>`;
});
await writeFile(manifestPath, manifest, "utf8");
console.log("Android launcher icon branded as Duress Security shield.");
