import { readFile, writeFile } from "node:fs/promises";

const path = "src/lib/vault-crypto.ts";
const source = await readFile(path, "utf8");
let next = source;

if (!next.includes("async function verifyV2(")) {
  const anchor = "async function verifyV3(raw: string, passphrase: string): Promise<void> {";
  if (!next.includes(anchor)) throw new Error("verifyV3 anchor not found");
  const verifyV2 = `async function verifyV2(raw: string, passphrase: string): Promise<void> { const opened = await decryptEnvelope(parseEnvelope(raw), passphrase); if (opened.version !== 2) throw new Error("VAULT_MIGRATION_VERIFICATION_FAILED"); }\n`;
  next = next.replace(anchor, `${verifyV2}${anchor}`);
}

next = next.replace(
  "async function migrateV2(raw: string, passphrase: string): Promise<EncryptedVaultFile[]> { const opened = await decryptEnvelope(parseEnvelope(raw), passphrase);",
  "async function migrateV2(raw: string, passphrase: string): Promise<EncryptedVaultFile[]> { await verifyV2(raw, passphrase); const opened = await decryptEnvelope(parseEnvelope(raw), passphrase);",
);

next = next.replace(
  "if (!activeKey || activeVersion !== 2) throw new Error(\"VAULT_LOCKED\");",
  "if (!activeKey || activeVersion !== 3) throw new Error(\"VAULT_LOCKED\");",
);

if (next === source) {
  console.log("Vault verification repair already present.");
} else {
  await writeFile(path, next, "utf8");
  console.log("Restored verifyV2 invariant and aligned encrypted attachments with vault v3.");
}
