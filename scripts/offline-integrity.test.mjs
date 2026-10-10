import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => readFile(path.join(root, relative), "utf8");

test("offline guard allows no remote host", async () => {
  const source = await read("src/lib/network-guard.ts");
  assert.match(source, /parsed\.origin === location\.origin/);
  assert.doesNotMatch(source, /grok\.com/);
  assert.doesNotMatch(source, /\.grok\.com/);
});

test("offline Android setup strips network permissions", async () => {
  const source = await read("scripts/android-setup.mjs");
  assert.ok(source.includes('android\\.permission\\.INTERNET'));
  assert.ok(source.includes('android\\.permission\\.ACCESS_NETWORK_STATE'));
});

test("offline manifest additions do not request internet access", async () => {
  const source = await read("android-native/manifest-additions.xml");
  assert.doesNotMatch(source, /android\.permission\.INTERNET/);
  assert.doesNotMatch(source, /android\.permission\.ACCESS_NETWORK_STATE/);
});
