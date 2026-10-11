import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(new URL(".", import.meta.url).pathname, "..");
const gradlePath = path.join(root, "android", "app", "build.gradle");
const ktsPath = path.join(root, "android", "app", "build.gradle.kts");

const exists = (file) => access(file).then(() => true).catch(() => false);

const patchGroovy = (source) => {
  let out = source;
  out = out.replace(/sourceCompatibility\s+JavaVersion\.VERSION_\d+/g, "sourceCompatibility JavaVersion.VERSION_17");
  out = out.replace(/targetCompatibility\s+JavaVersion\.VERSION_\d+/g, "targetCompatibility JavaVersion.VERSION_17");
  if (!out.includes("compileOptions")) {
    out = out.replace(/android\s*\{/, (m) => `${m}\n    compileOptions { sourceCompatibility JavaVersion.VERSION_17; targetCompatibility JavaVersion.VERSION_17 }`);
  }
  if (!out.includes("jvmToolchain(17)")) out += `\n\nkotlin { jvmToolchain(17) }\n`;
  return out;
};

const patchKts = (source) => {
  let out = source.replace(/JavaVersion\.VERSION_\d+/g, "JavaVersion.VERSION_17");
  if (!out.includes("compileOptions")) {
    out = out.replace(/android\s*\{/, (m) => `${m}\n    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }`);
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

console.log("Android Java/Kotlin JVM targets aligned at 17.");
