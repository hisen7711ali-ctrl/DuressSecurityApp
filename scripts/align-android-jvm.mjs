import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(new URL(".", import.meta.url).pathname, "..");
const gradlePath = path.join(root, "android", "app", "build.gradle");
const ktsPath = path.join(root, "android", "app", "build.gradle.kts");

const exists = (file) => access(file).then(() => true).catch(() => false);

const patchGroovy = (source) => {
  let out = source;
  // Use Java source/target 17 only. Do not combine them with Gradle's
  // JavaCompile --release option; Android Gradle Plugin rejects that mix.
  out = out.replace(/sourceCompatibility\s*=\s*JavaVersion\.VERSION_\d+/g, "sourceCompatibility = JavaVersion.VERSION_17");
  out = out.replace(/targetCompatibility\s*=\s*JavaVersion\.VERSION_\d+/g, "targetCompatibility = JavaVersion.VERSION_17");
  out = out.replace(/sourceCompatibility\s+JavaVersion\.VERSION_\d+/g, "sourceCompatibility JavaVersion.VERSION_17");
  out = out.replace(/targetCompatibility\s+JavaVersion\.VERSION_\d+/g, "targetCompatibility JavaVersion.VERSION_17");
  if (!out.includes("compileOptions")) {
    out = out.replace(/android\s*\{/, (m) => `${m}\n    compileOptions { sourceCompatibility JavaVersion.VERSION_17; targetCompatibility JavaVersion.VERSION_17 }`);
  }
  // Remove any release configuration left by an older generated script.
  out = out.replace(/\n?tasks\.withType\(JavaCompile\)\.configureEach\s*\{[^}]*options\.release\s*=\s*17[^}]*\}\s*/g, "\n");
  out = out.replace(/\n?tasks\.withType<JavaCompile>\(\)\.configureEach\s*\{[^}]*options\.release\.set\(17\)[^}]*\}\s*/g, "\n");
  // Kotlin 2.x: target JVM 17 without introducing a Java toolchain/release mix.
  out = out.replace(/kotlin\s*\{\s*jvmToolchain\(\d+\)\s*\}/g, "kotlin { kotlinOptions { jvmTarget = \"17\" } }");
  if (!out.includes("kotlinOptions { jvmTarget = \"17\" }")) {
    out += `\n\nkotlin { kotlinOptions { jvmTarget = \"17\" } }\n`;
  }
  return out;
};

const patchKts = (source) => {
  let out = source;
  out = out.replace(/sourceCompatibility\s*=\s*JavaVersion\.VERSION_\d+/g, "sourceCompatibility = JavaVersion.VERSION_17");
  out = out.replace(/targetCompatibility\s*=\s*JavaVersion\.VERSION_\d+/g, "targetCompatibility = JavaVersion.VERSION_17");
  out = out.replace(/JavaVersion\.VERSION_\d+/g, "JavaVersion.VERSION_17");
  if (!out.includes("compileOptions")) {
    out = out.replace(/android\s*\{/, (m) => `${m}\n    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }`);
  }
  out = out.replace(/\n?tasks\.withType<JavaCompile>\(\)\.configureEach\s*\{[^}]*options\.release\.set\(17\)[^}]*\}\s*/g, "\n");
  out = out.replace(/kotlin\s*\{\s*jvmToolchain\(\d+\)\s*\}/g, "kotlin { kotlinOptions { jvmTarget = \"17\" } }");
  if (!out.includes("kotlinOptions { jvmTarget = \"17\" }")) {
    out += `\n\nkotlin { kotlinOptions { jvmTarget = \"17\" } }\n`;
  }
  return out;
};

if (await exists(gradlePath)) {
  await writeFile(gradlePath, patchGroovy(await readFile(gradlePath, "utf8")));
} else if (await exists(ktsPath)) {
  await writeFile(ktsPath, patchKts(await readFile(ktsPath, "utf8")));
} else {
  throw new Error(`Android app Gradle file was not generated under ${path.join(root, "android", "app")}`);
}

const finalPath = await exists(gradlePath) ? gradlePath : ktsPath;
const finalSource = await readFile(finalPath, "utf8");
if (/JavaVersion\.VERSION_(?!17\b)\d+/.test(finalSource)) {
  throw new Error("Android Gradle file still contains a non-17 JavaVersion target after alignment.");
}
if (!finalSource.includes("kotlinOptions { jvmTarget = \"17\" }")) {
  throw new Error("Android Gradle file is missing Kotlin JVM target 17 after alignment.");
}
if (/options\.release/.test(finalSource)) {
  throw new Error("Android Gradle file still combines Java source/target with --release configuration.");
}

console.log("Android Java/Kotlin JVM targets aligned at 17 without Java --release conflict.");
