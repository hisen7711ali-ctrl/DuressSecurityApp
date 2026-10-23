import { readFile, writeFile } from "node:fs/promises";

const replacements = [
  ["scripts/repair-uninstall-settings-2026-10-19.mjs", "const pattern = /          hint=", "const pattern = /\\s{10}hint="],
  ["scripts/maintenance-and-app-lock-regression.test.mjs", "  const settings = await read(\"src/components/settings-screen.tsx\");\n  const plugin", "  const plugin"],
  ["src/components/lock-gate.tsx", "  const appLockBackgroundImage = useAppStore((s) => s.appLockBackgroundImage);\n", ""],
  ["src/components/lock-gate.tsx", "  const appLockBackgroundScale = useAppStore((s) => s.appLockBackgroundScale);\n", ""],
  ["src/components/lock-gate.tsx", "  const appLockBackgroundX = useAppStore((s) => s.appLockBackgroundX);\n", ""],
  ["src/components/lock-gate.tsx", "  const appLockBackgroundY = useAppStore((s) => s.appLockBackgroundY);\n", ""],
  ["src/components/pins-panel.tsx", "getCalculatorCommand, ", ""],
  ["src/components/settings-screen.tsx", "  const homeLockEnabled = useAppStore((s) => s.homeLockEnabled);\n", ""],
  ["src/components/settings-screen.tsx", "  const dedicatedDeviceMode = useAppStore((s) => s.dedicatedDeviceMode);\n", ""],
  ["src/lib/auth/use-current-user.ts", "  // eslint-disable-next-line react-hooks/rules-of-hooks -- authEnabled is constant for the app's lifetime\n", ""],
  ["src/lib/vault-crypto.ts", "async function verifyV2(raw: string, passphrase: string): Promise<void> { const opened = await decryptEnvelope(parseEnvelope(raw), passphrase); if (opened.version !== 2) throw new Error(\"VAULT_MIGRATION_VERIFICATION_FAILED\"); }\n", ""],
];

const touched = new Set();
for (const [path, from, to] of replacements) {
  const source = await readFile(path, "utf8");
  if (!source.includes(from)) continue;
  const next = source.replace(from, to);
  if (next !== source) {
    await writeFile(path, next);
    touched.add(path);
  }
}
console.log(`Lint cleanup touched ${touched.size} file(s).`);
