import * as nativeBridge from "@/lib/native-bridge";

export const SECURITY_AUDIT_STORAGE_KEY = "duress-security-failed-attempt-history";
const MAX_AUDIT_RECORDS = 200;

export type SecurityAttemptRecord = {
  at: number;
  packageName: string;
  context: "main" | "app";
  attemptedLength: number;
  attemptNumber: number;
  outcome: "rejected" | "rate-limited";
};

function validRecord(value: unknown): value is SecurityAttemptRecord {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<SecurityAttemptRecord>;
  return Number.isFinite(row.at) && typeof row.packageName === "string" &&
    (row.context === "main" || row.context === "app") &&
    Number.isInteger(row.attemptedLength) && (row.attemptedLength ?? -1) >= 0 && (row.attemptedLength ?? 99) <= 10 &&
    Number.isInteger(row.attemptNumber) && (row.attemptNumber ?? 0) >= 1 &&
    (row.outcome === "rejected" || row.outcome === "rate-limited");
}

function parseRecords(raw: string | null): SecurityAttemptRecord[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(validRecord).slice(-MAX_AUDIT_RECORDS) : [];
  } catch { return []; }
}

/** Never fall back to plaintext local storage if the Android secure store is unavailable. */
export async function loadFailedAttemptHistory(): Promise<SecurityAttemptRecord[] | null> {
  if (!nativeBridge.isNativeAndroid()) return null;
  const read = await nativeBridge.secureStorageGet(SECURITY_AUDIT_STORAGE_KEY);
  if (!read.available && read.reason !== "KEY_MISSING") return null;
  if (!read.found || !read.value) return [];
  return parseRecords(read.value);
}

/** Store metadata only; the attempted PIN itself is never retained. */
export async function recordFailedAttempt(input: Omit<SecurityAttemptRecord, "at"> & { at?: number }): Promise<boolean> {
  if (!nativeBridge.isNativeAndroid()) return false;
  const read = await nativeBridge.secureStorageGet(SECURITY_AUDIT_STORAGE_KEY);
  if (!read.available && read.reason !== "KEY_MISSING") return false;
  const records = parseRecords(read.found ? read.value : null);
  const record: SecurityAttemptRecord = {
    at: Math.max(0, Math.floor(input.at ?? Date.now())),
    packageName: input.packageName.slice(0, 240),
    context: input.context,
    attemptedLength: Math.max(0, Math.min(10, Math.floor(input.attemptedLength))),
    attemptNumber: Math.max(1, Math.floor(input.attemptNumber)),
    outcome: input.outcome,
  };
  const saved = await nativeBridge.secureStorageSet(SECURITY_AUDIT_STORAGE_KEY, JSON.stringify([...records, record].slice(-MAX_AUDIT_RECORDS)));
  if (saved && typeof window !== "undefined") window.dispatchEvent(new Event("duress-security-audit-updated"));
  return saved;
}
