import { execFileSync } from "node:child_process";
import fs from "node:fs";

const file = "src/lib/store.ts";
const knownGoodCommit = "a1ad4d8b0f7a2df58b59d8c02363c0f9063b03b6";

execFileSync("git", ["fetch", "--no-tags", "origin", knownGoodCommit, "--depth=1"], { stdio: "inherit" });
const restored = execFileSync("git", ["show", `${knownGoodCommit}:${file}`], { encoding: "utf8" });
const marker = 'type TransientSlice = { ready: boolean; session: SessionMode; storageErrorCode: string | null; armedEmergencyCode: "7777" | "8888" | null; tab: TabId; panel: PanelId; overlay: OverlayRequest | null; openedApp: string | null; vaultOpen: boolean; vaultCryptoReady: boolean; toast: string | null; security: SecurityState };';
const typeLine = 'type PinSubmitResult = "ok" | "duress" | "wipe" | "extended-lock" | "wrong" | "duplicate" | "lockout" | "need-master" | "armed-emergency";';
const actionLine = '  submitPin: (pin: string) => "ok" | "duress" | "wipe" | "extended-lock" | "wrong" | "duplicate" | "lockout" | "need-master";';
if (!restored.includes(marker) || !restored.includes(actionLine)) throw new Error("Known-good store structure not found; refusing an unsafe rewrite.");
const repaired = restored.replace(`${marker}\n`, `${marker}\n${typeLine}\n`).replace(actionLine, "  submitPin: (pin: string) => PinSubmitResult;");
fs.writeFileSync(file, repaired);
console.log("Restored store.ts from the known-good parent and aligned the emergency PIN result type.");
