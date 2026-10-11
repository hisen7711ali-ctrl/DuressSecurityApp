import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const androidDir = path.join(root, "android");
const gradlePath = path.join(androidDir, "app", "build.gradle");
const ktsPath = path.join(androidDir, "app", "build.gradle.kts");
const manifestPath = path.join(androidDir, "app", "src", "main", "AndroidManifest.xml");
const exists = file => access(file).then(() => true).catch(() => false);

const kotlinCompilerBlock = `kotlin { compilerOptions { jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17 } }`;
const groovyJavaTaskBlock = `tasks.withType(JavaCompile).configureEach { sourceCompatibility = "17"; targetCompatibility = "17" }`;
const ktsJavaTaskBlock = `tasks.withType<JavaCompile>().configureEach { sourceCompatibility = "17"; targetCompatibility = "17" }`;

const patchGroovy = source => {
  let out = source;
  out = out.replace(/sourceCompatibility\s*=\s*JavaVersion\.VERSION_\d+/g, "sourceCompatibility = JavaVersion.VERSION_17");
  out = out.replace(/targetCompatibility\s*=\s*JavaVersion\.VERSION_\d+/g, "targetCompatibility = JavaVersion.VERSION_17");
  out = out.replace(/sourceCompatibility\s+JavaVersion\.VERSION_\d+/g, "sourceCompatibility JavaVersion.VERSION_17");
  out = out.replace(/targetCompatibility\s+JavaVersion\.VERSION_\d+/g, "targetCompatibility JavaVersion.VERSION_17");
  out = out.replace(/jvmTarget\s*=\s*["']\d+["']/g, 'jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17');
  out = out.replace(/jvmToolchain\(\d+\)/g, "jvmToolchain(17)");
  out = out.replace(/kotlin\s*\{\s*kotlinOptions\s*\{[\s\S]*?\}\s*\}/g, kotlinCompilerBlock);
  out = out.replace(/tasks\.withType\(JavaCompile\)\.configureEach\s*\{[\s\S]*?\}/g, "");
  out = out.replace(/\boptions\.release\s*=\s*[^\n;]+;?/g, "");
  out = out.replace(/\boptions\.release\.set\([^\)]*\)/g, "");
  if (!out.includes("compileOptions")) {
    out = out.replace(/android\s*\{/, m => `${m}\n    compileOptions { sourceCompatibility JavaVersion.VERSION_17; targetCompatibility JavaVersion.VERSION_17 }`);
  }
  if (!/kotlin\s*\{[\s\S]*compilerOptions\s*\{/.test(out)) out += `\n\n${kotlinCompilerBlock}\n`;
  if (!/tasks\.withType\(JavaCompile\)\.configureEach/.test(out)) out += `\n${groovyJavaTaskBlock}\n`;
  return out;
};

const patchKts = source => {
  let out = source;
  out = out.replace(/sourceCompatibility\s*=\s*JavaVersion\.VERSION_\d+/g, "sourceCompatibility = JavaVersion.VERSION_17");
  out = out.replace(/targetCompatibility\s*=\s*JavaVersion\.VERSION_\d+/g, "targetCompatibility = JavaVersion.VERSION_17");
  out = out.replace(/JavaVersion\.VERSION_\d+/g, "JavaVersion.VERSION_17");
  out = out.replace(/jvmTarget\s*=\s*["']\d+["']/g, 'jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17');
  out = out.replace(/jvmToolchain\(\d+\)/g, "jvmToolchain(17)");
  out = out.replace(/kotlin\s*\{\s*kotlinOptions\s*\{[\s\S]*?\}\s*\}/g, kotlinCompilerBlock);
  out = out.replace(/tasks\.withType<JavaCompile>\(\)\.configureEach\s*\{[\s\S]*?\}/g, "");
  out = out.replace(/\boptions\.release\s*=\s*[^\n;]+;?/g, "");
  out = out.replace(/\boptions\.release\.set\([^\)]*\)/g, "");
  if (!out.includes("compileOptions")) {
    out = out.replace(/android\s*\{/, m => `${m}\n    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }`);
  }
  if (!/kotlin\s*\{[\s\S]*compilerOptions\s*\{/.test(out)) out += `\n\n${kotlinCompilerBlock}\n`;
  if (!/tasks\.withType<JavaCompile>\(\)\.configureEach/.test(out)) out += `\n${ktsJavaTaskBlock}\n`;
  return out;
};

if (await exists(gradlePath)) await writeFile(gradlePath, patchGroovy(await readFile(gradlePath, "utf8")));
else if (await exists(ktsPath)) await writeFile(ktsPath, patchKts(await readFile(ktsPath, "utf8")));
else throw new Error(`Android app Gradle file was not generated under ${path.join(androidDir, "app")}`);

const finalPath = await exists(gradlePath) ? gradlePath : ktsPath;
const finalSource = await readFile(finalPath, "utf8");
if (/JavaVersion\.VERSION_(?!17\b)\d+/.test(finalSource)) throw new Error("Android Gradle file still contains a non-17 JavaVersion target after alignment.");
if (/jvmTarget\s*=\s*["'](?!17["'])\d+["']/.test(finalSource)) throw new Error("Android Gradle file still contains a non-17 Kotlin JVM target after alignment.");
if (/kotlin\s*\{\s*kotlinOptions\s*\{/.test(finalSource)) throw new Error("Android Gradle file still contains obsolete Kotlin kotlinOptions configuration.");
if (!/compilerOptions\s*\{[\s\S]*JvmTarget\.JVM_17/.test(finalSource)) throw new Error("Android Gradle file is missing Kotlin compilerOptions JVM target 17 after alignment.");
if (/options\.release/.test(finalSource)) throw new Error("Android Gradle file still contains Java --release configuration after alignment.");
if (!/tasks\.withType(?:<JavaCompile>)?\(JavaCompile\)\.configureEach|tasks\.withType<JavaCompile>\(\)\.configureEach/.test(finalSource)) throw new Error("Android Gradle file is missing explicit JavaCompile JVM 17 task alignment.");

if (await exists(manifestPath)) {
  let manifest = await readFile(manifestPath, "utf8");
  manifest = manifest.replace(/\s*<uses-permission\s+android:name="android\.permission\.(?:INTERNET|ACCESS_NETWORK_STATE)"\s*\/>/g, "");
  await writeFile(manifestPath, manifest);
  if (/android\.permission\.(?:INTERNET|ACCESS_NETWORK_STATE)/.test(manifest)) throw new Error("Final Android manifest still requests network permissions.");
}

console.log("Android Java/Kotlin compilation tasks are explicitly pinned to JVM 17; Kotlin compilerOptions and offline manifest are finalized after Capacitor sync.");
