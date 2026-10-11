import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(new URL(".", import.meta.url).pathname, "..");
const gradlePath = path.join(root, "android", "app", "build.gradle");
const ktsPath = path.join(root, "android", "app", "build.gradle.kts");

const exists = (file) => access(file).then(() => true).catch(() => false);

const patchGroovy = (source) => {
  let out = source;
  // Capacitor may generate either Groovy assignment style or shorthand style.
  // Normalize every JavaVersion target so Kotlin and javac cannot disagree.
  out = out.replace(/sourceCompatibility\s*=\s*JavaVersion\.VERSION_\d+/g, "sourceCompatibility = JavaVersion.VERSION_17");
  out = out.replace(/targetCompatibility\s*=\s*JavaVersion\.VERSION_\d+/g, "targetCompatibility = JavaVersion.VERSION_17");
  out = out.replace(/sourceCompatibility\s+JavaVersion\.VERSION_\d+/g, "sourceCompatibility JavaVersion.VERSION_17");
  out = out.replace(/targetCompatibility\s+JavaVersion\.VERSION_\d+/g, "targetCompatibility JavaVersion.VERSION_17");
  if (!out.includes("compileOptions")) {
    out = out.replace(/android\s*\{/, (m) => `${m}\n    compileOptions { sourceCompatibility JavaVersion.VERSION_17; targetCompatibility JavaVersion.VERSION_17 }`);
  }
  // Be explicit at the task level too. This protects against Android/Capacitor
  // generated defaults that otherwise inherit the host JDK (21 on CI).
  if (!out.includes("options.release = 17")) {
    out += `\n\ntasks.withType(JavaCompile).configureEach { options.release = 17 }\n`;
  }
  if (!out.includes("jvmToolchain(17)")) out += `\n\nkotlin { jvmToolchain(17) }\n`;
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
  if (!out.includes("options.release.set(17)")) {
    out += `\n\ntasks.withType<JavaCompile>().configureEach { options.release.set(17) }\n`;
  }
  if (!out.includes("jvmToolchain(17)")) out += `\n\nkotlin { jvmToolchain(17) }\n`;
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
if (!finalSource.includes("jvmToolchain(17)")) {
  throw new Error("Android Gradle file is missing Kotlin JVM toolchain 17 after alignment.");
}

console.log("Android Java/Kotlin JVM targets aligned at 17 and verified.");
