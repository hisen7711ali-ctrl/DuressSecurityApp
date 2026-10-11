import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const androidDir = path.join(root, "android");
const gradlePath = path.join(androidDir, "app", "build.gradle");
const ktsPath = path.join(androidDir, "app", "build.gradle.kts");
const manifestPath = path.join(androidDir, "app", "src", "main", "AndroidManifest.xml");

const exists = file => access(file).then(() => true).catch(() => false);

const patchGroovy = source => {
  let out = source;
  out = out.replace(/sourceCompatibility\s*=\s*JavaVersion\.VERSION_\d+/g, "sourceCompatibility = JavaVersion.VERSION_17");
  out = out.replace(/targetCompatibility\s*=\s*JavaVersion\.VERSION_\d+/g, "targetCompatibility = JavaVersion.VERSION_17");
  out = out.replace(/sourceCompatibility\s+JavaVersion\.VERSION_\d+/g, "sourceCompatibility JavaVersion.VERSION_17");
  out = out.replace(/targetCompatibility\s+JavaVersion\.VERSION_\d+/g, "targetCompatibility JavaVersion.VERSION_17");
  out = out.replace(/jvmTarget\s*=\s*["']\d+["']/g, 'jvmTarget = "17"');
  out = out.replace(/jvmToolchain\(\d+\)/g, "jvmToolchain(17)");
  out = out.replace(/tasks\.withType\(JavaCompile\)\.configureEach\s*\{[\s\S]*?\}/g, block => /options\.release/.test(block) ? "" : block);
  out = out.replace(/tasks\.withType<JavaCompile>\(\)\.configureEach\s*\{[\s\S]*?\}/g, block => /options\.release/.test(block) ? "" : block);
  out = out.replace(/\boptions\.release\s*=\s*[^\n;]+;?/g, "");
  out = out.replace(/\boptions\.release\.set\([^\)]*\)/g, "");
  if (!out.includes("compileOptions")) {
    out = out.replace(/android\s*\{/, m => `${m}\n    compileOptions { sourceCompatibility JavaVersion.VERSION_17; targetCompatibility JavaVersion.VERSION_17 }`);
  }
  if (!out.includes('jvmTarget = "17"')) {
    out += `\n\nkotlin { kotlinOptions { jvmTarget = "17" } }\n`;
  }
  return out;
};

const patchKts = source => {
  let out = source;
  out = out.replace(/sourceCompatibility\s*=\s*JavaVersion\.VERSION_\d+/g, "sourceCompatibility = JavaVersion.VERSION_17");
  out = out.replace(/targetCompatibility\s*=\s*JavaVersion\.VERSION_\d+/g, "targetCompatibility = JavaVersion.VERSION_17");
  out = out.replace(/JavaVersion\.VERSION_\d+/g, "JavaVersion.VERSION_17");
  out = out.replace(/jvmTarget\s*=\s*["']\d+["']/g, 'jvmTarget = "17"');
  out = out.replace(/jvmToolchain\(\d+\)/g, "jvmToolchain(17)");
  out = out.replace(/tasks\.withType<JavaCompile>\(\)\.configureEach\s*\{[\s\S]*?\}/g, block => /options\.release/.test(block) ? "" : block);
  out = out.replace(/\boptions\.release\s*=\s*[^\n;]+;?/g, "");
  out = out.replace(/\boptions\.release\.set\([^\)]*\)/g, "");
  if (!out.includes("compileOptions")) {
    out = out.replace(/android\s*\{/, m => `${m}\n    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }`);
  }
  if (!out.includes('jvmTarget = "17"')) {
    out += `\n\nkotlin { kotlinOptions { jvmTarget = "17" } }\n`;
  }
  return out;
};

if (await exists(gradlePath)) {
  await writeFile(gradlePath, patchGroovy(await readFile(gradlePath, "utf8")));
} else if (await exists(ktsPath)) {
  await writeFile(ktsPath, patchKts(await readFile(ktsPath, "utf8")));
} else {
  throw new Error(`Android app Gradle file was not generated under ${path.join(androidDir, "app")}`);
}

const finalPath = await exists(gradlePath) ? gradlePath : ktsPath;
const finalSource = await readFile(finalPath, "utf8");
if (/JavaVersion\.VERSION_(?!17\b)\d+/.test(finalSource)) throw new Error("Android Gradle file still contains a non-17 JavaVersion target after alignment.");
if (/jvmTarget\s*=\s*["'](?!17["'])\d+["']/.test(finalSource)) throw new Error("Android Gradle file still contains a non-17 Kotlin JVM target after alignment.");
if (!finalSource.includes('jvmTarget = "17"')) throw new Error("Android Gradle file is missing Kotlin JVM target 17 after alignment.");
if (/options\.release/.test(finalSource)) throw new Error("Android Gradle file still contains Java --release configuration after alignment.");

// `cap sync` can reintroduce network permissions. Enforce the offline invariant
// on the final generated manifest immediately before Gradle.
if (await exists(manifestPath)) {
  let manifest = await readFile(manifestPath, "utf8");
  manifest = manifest.replace(/\s*<uses-permission\s+android:name="android\.permission\.(?:INTERNET|ACCESS_NETWORK_STATE)"\s*\/>/g, "");
  await writeFile(manifestPath, manifest);
  if (/android\.permission\.(?:INTERNET|ACCESS_NETWORK_STATE)/.test(manifest)) throw new Error("Final Android manifest still requests network permissions.");
}

console.log("Android Java/Kotlin JVM targets aligned at 17, Java --release removed, and final manifest kept offline.");
