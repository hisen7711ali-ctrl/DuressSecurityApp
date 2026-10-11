import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const androidDir = path.join(root, "android");
const appGradle = path.join(androidDir, "app", "build.gradle");
const appKts = path.join(androidDir, "app", "build.gradle.kts");
const rootGradle = path.join(androidDir, "build.gradle");
const rootKts = path.join(androidDir, "build.gradle.kts");
const manifest = path.join(androidDir, "app", "src", "main", "AndroidManifest.xml");
const exists = p => access(p).then(() => true).catch(() => false);

const groovyAppTasks = `tasks.withType(JavaCompile).configureEach {
  sourceCompatibility = "21"
  targetCompatibility = "21"
  javaCompiler = javaToolchains.compilerFor { languageVersion = JavaLanguageVersion.of(21) }
}
tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompilationTask).configureEach {
  compilerOptions.jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_21)
}`;
const ktsAppTasks = `tasks.withType<JavaCompile>().configureEach {
  sourceCompatibility = "21"
  targetCompatibility = "21"
  javaCompiler = javaToolchains.compilerFor { languageVersion = JavaLanguageVersion.of(21) }
}
tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompilationTask>().configureEach {
  compilerOptions.jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_21)
}`;
const groovyAllModules = `// DURESS_JVM21_ALL_MODULES
subprojects {
  tasks.withType(JavaCompile).configureEach {
    sourceCompatibility = "21"
    targetCompatibility = "21"
    javaCompiler = javaToolchains.compilerFor { languageVersion = JavaLanguageVersion.of(21) }
  }
  tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompilationTask).configureEach {
    compilerOptions.jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_21)
  }
}`;
const ktsAllModules = `// DURESS_JVM21_ALL_MODULES
subprojects {
  tasks.withType<JavaCompile>().configureEach {
    sourceCompatibility = "21"
    targetCompatibility = "21"
    javaCompiler = javaToolchains.compilerFor { languageVersion = JavaLanguageVersion.of(21) }
  }
  tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompilationTask>().configureEach {
    compilerOptions.jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_21)
  }
}`;

const normalizeAppGroovy = source => {
  let out = source;
  out = out.replace(/JavaVersion\.VERSION_\d+/g, "JavaVersion.VERSION_21");
  out = out.replace(/jvmTarget\s*=\s*["']\d+["']/g, "jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_21");
  out = out.replace(/jvmToolchain\(\d+\)/g, "jvmToolchain(21)");
  out = out.replace(/kotlin\s*\{\s*kotlinOptions\s*\{[\s\S]*?\}\s*\}/g, "kotlin { compilerOptions { jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_21 } }");
  out = out.replace(/tasks\.withType\(JavaCompile\)\.configureEach\s*\{[\s\S]*?\}/g, "");
  out = out.replace(/tasks\.withType\(org\.jetbrains\.kotlin\.gradle\.tasks\.KotlinCompilationTask\)\.configureEach\s*\{[\s\S]*?\}/g, "");
  out = out.replace(/\boptions\.release(?:\.set)?\s*\([^\)]*\)|\boptions\.release\s*=\s*[^\n;]+;?/g, "");
  if (!out.includes("compileOptions")) out = out.replace(/android\s*\{/, m => `${m}\n  compileOptions { sourceCompatibility JavaVersion.VERSION_21; targetCompatibility JavaVersion.VERSION_21 }`);
  else out = out.replace(/compileOptions\s*\{[\s\S]*?\}/, "compileOptions { sourceCompatibility JavaVersion.VERSION_21; targetCompatibility JavaVersion.VERSION_21 }");
  if (!/kotlin\s*\{[\s\S]*compilerOptions\s*\{/.test(out)) out += `\n\nkotlin { compilerOptions { jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_21 } }\n`;
  out += `\n${groovyAppTasks}\n`;
  return out;
};

const normalizeAppKts = source => {
  let out = source;
  out = out.replace(/JavaVersion\.VERSION_\d+/g, "JavaVersion.VERSION_21");
  out = out.replace(/jvmTarget\s*=\s*["']\d+["']/g, "jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_21");
  out = out.replace(/jvmToolchain\(\d+\)/g, "jvmToolchain(21)");
  out = out.replace(/kotlin\s*\{\s*kotlinOptions\s*\{[\s\S]*?\}\s*\}/g, "kotlin { compilerOptions { jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_21 } }");
  out = out.replace(/tasks\.withType<JavaCompile>\(\)\.configureEach\s*\{[\s\S]*?\}/g, "");
  out = out.replace(/tasks\.withType<org\.jetbrains\.kotlin\.gradle\.tasks\.KotlinCompilationTask>\(\)\.configureEach\s*\{[\s\S]*?\}/g, "");
  out = out.replace(/\boptions\.release(?:\.set)?\s*\([^\)]*\)|\boptions\.release\s*=\s*[^\n;]+;?/g, "");
  if (!out.includes("compileOptions")) out = out.replace(/android\s*\{/, m => `${m}\n  compileOptions { sourceCompatibility = JavaVersion.VERSION_21; targetCompatibility = JavaVersion.VERSION_21 }`);
  else out = out.replace(/compileOptions\s*\{[\s\S]*?\}/, "compileOptions { sourceCompatibility = JavaVersion.VERSION_21; targetCompatibility = JavaVersion.VERSION_21 }");
  if (!/kotlin\s*\{[\s\S]*compilerOptions\s*\{/.test(out)) out += `\n\nkotlin { compilerOptions { jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_21 } }\n`;
  out += `\n${ktsAppTasks}\n`;
  return out;
};

const normalizeRootGroovy = source => source.includes("DURESS_JVM21_ALL_MODULES") ? source : `${source}\n\n${groovyAllModules}\n`;
const normalizeRootKts = source => source.includes("DURESS_JVM21_ALL_MODULES") ? source : `${source}\n\n${ktsAllModules}\n`;

if (await exists(appGradle)) await writeFile(appGradle, normalizeAppGroovy(await readFile(appGradle, "utf8")));
else if (await exists(appKts)) await writeFile(appKts, normalizeAppKts(await readFile(appKts, "utf8")));
else throw new Error(`Android app Gradle file was not generated under ${androidDir}/app`);

if (await exists(rootGradle)) await writeFile(rootGradle, normalizeRootGroovy(await readFile(rootGradle, "utf8")));
else if (await exists(rootKts)) await writeFile(rootKts, normalizeRootKts(await readFile(rootKts, "utf8")));
else throw new Error(`Android root Gradle file was not generated under ${androidDir}`);

const appPath = await exists(appGradle) ? appGradle : appKts;
const rootPath = await exists(rootGradle) ? rootGradle : rootKts;
const appSource = await readFile(appPath, "utf8");
const rootSource = await readFile(rootPath, "utf8");
const combined = appSource + rootSource;
if (/JavaVersion\.VERSION_(?!21\b)\d+/.test(combined)) throw new Error("Non-21 JavaVersion target remains after alignment.");
if (/kotlin\s*\{\s*kotlinOptions\s*\{/.test(appSource)) throw new Error("Obsolete kotlinOptions remains after alignment.");
if (/options\.release/.test(combined)) throw new Error("Java --release configuration remains after alignment.");
if (!/javaCompiler\s*=\s*javaToolchains\.compilerFor[\s\S]*JavaLanguageVersion\.of\(21\)/.test(combined)) throw new Error("Explicit Java 21 compiler toolchain is missing.");
if (!/KotlinCompilationTask/.test(combined) || !/JvmTarget\.JVM_21/.test(combined)) throw new Error("Kotlin JVM 21 task alignment is missing.");
if (!/DURESS_JVM21_ALL_MODULES/.test(rootSource) || !/subprojects\s*\{[\s\S]*JavaCompile/.test(rootSource)) throw new Error("All Android subprojects are not pinned to JVM 21.");

if (await exists(manifest)) {
  let source = await readFile(manifest, "utf8");
  source = source.replace(/\s*<uses-permission\s+android:name="android\.permission\.(?:INTERNET|ACCESS_NETWORK_STATE)"\s*\/>/g, "");
  await writeFile(manifest, source);
  if (/android\.permission\.(?:INTERNET|ACCESS_NETWORK_STATE)/.test(source)) throw new Error("Final Android manifest still requests network permissions.");
}

console.log("Android Java/Kotlin compile tasks are pinned to JVM 21 across the app and every Android subproject; offline manifest is finalized after Capacitor sync.");
