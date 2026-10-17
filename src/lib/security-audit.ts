import * as nativeBridge from "@/lib/native-bridge";

export const SECURITY_AUDIT_STORAGE_KEY = "duress-security-failed-attempt-history";
const MAX_AUDIT_RECORDS = 200;
const MAIN_APP_PACKAGE = "com.duresssecurity.app";

export type SecurityAttemptRecord = {
  at: number;
  packageName: string;
  context: "main" | "app";
  attemptedLength: number;
  attemptNumber: number;
  outcome: "rejected" | "rate-limited" | "accepted";
};

function validRecord(value: unknown): value is SecurityAttemptRecord {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<SecurityAttemptRecord>;
  return Number.isFinite(row.at) && typeof row.packageName === "string" &&
    (row.context === "main" || row.context === "app") &&
    Number.isInteger(row.attemptedLength) && (row.attemptedLength ?? -1) >= 0 && (row.attemptedLength ?? 99) <= 10 &&
    Number.isInteger(row.attemptNumber) && (row.attemptNumber ?? 0) >= 1 &&
    (row.outcome === "rejected" || row.outcome === "rate-limited" || row.outcome === "accepted");
}

function parseRecords(raw: string | null): SecurityAttemptRecord[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(validRecord).slice(-MAX_AUDIT_RECORDS) : [];
  } catch { return []; }
}

async function readJournal(): Promise<{ records: SecurityAttemptRecord[] } | null> {
  if (!nativeBridge.isNativeAndroid()) return null;
  const read = await nativeBridge.secureStorageGet(SECURITY_AUDIT_STORAGE_KEY);
  if (!read.available && read.reason !== "KEY_MISSING") return null;
  return { records: parseRecords(read.found ? read.value : null) };
}

async function writeRecord(record: SecurityAttemptRecord): Promise<boolean> {
  const journal = await readJournal();
  if (journal === null) return false;
  const saved = await nativeBridge.secureStorageSet(
    SECURITY_AUDIT_STORAGE_KEY,
    JSON.stringify([...journal.records, record].slice(-MAX_AUDIT_RECORDS)),
  );
  if (saved && typeof window !== "undefined") window.dispatchEvent(new Event("duress-security-audit-updated"));
  return saved;
}

/** Never fall back to plaintext local storage if the Android secure store is unavailable. */
export async function loadFailedAttemptHistory(): Promise<SecurityAttemptRecord[] | null> {
  const journal = await readJournal();
  // Successful-unlock markers are retained internally to calculate the
  // consecutive-failure counter, but are not shown as failed attempts.
  return journal === null ? null : journal.records.filter((record) => record.outcome !== "accepted");
}

/**
 * Restore consecutive failures from the encrypted journal. A successful owner
 * unlock writes a marker, so an ordinary application restart cannot reset this
 * count. null means the secure journal could not be verified.
 */
export async function loadConsecutiveMainFailedAttempts(): Promise<number | null> {
  const journal = await readJournal();
  if (journal === null) return null;
  let lastSuccessfulUnlock = -1;
  for (let i = journal.records.length - 1; i >= 0; i -= 1) {
    const record = journal.records[i]!;
    if (record.context === "main" && record.packageName === MAIN_APP_PACKAGE && record.outcome === "accepted") {
      lastSuccessfulUnlock = i;
      break;
    }
  }
  return journal.records
    .slice(lastSuccessfulUnlock + 1)
    .filter((record) =>
      record.context === "main" &&
      record.packageName === MAIN_APP_PACKAGE &&
      (record.outcome === "rejected" || record.outcome === "rate-limited"),
    )
    .length;
}

/** Store metadata only; the attempted PIN itself is never retained. */
export async function recordFailedAttempt(input: Omit<SecurityAttemptRecord, "at" | "outcome"> & {
  at?: number;
  outcome: "rejected" | "rate-limited";
}): Promise<boolean> {
  const persistedAttemptCount = input.context === "main" ? await loadConsecutiveMainFailedAttempts() : null;
  return writeRecord({
    at: Math.max(0, Math.floor(input.at ?? Date.now())),
    packageName: input.packageName.slice(0, 240),
    context: input.context,
    attemptedLength: Math.max(0, Math.min(10, Math.floor(input.attemptedLength))),
    // The journal count is authoritative for the main lock across lockout windows.
    attemptNumber: Math.max(1, Math.floor(persistedAttemptCount === null ? input.attemptNumber : persistedAttemptCount + 1)),
    outcome: input.outcome,
  });
}

/** Reset the consecutive main-lock failure count after verified owner unlock. */
export async function recordSuccessfulMainUnlock(): Promise<boolean> {
  return writeRecord({
    at: Math.max(0, Math.floor(Date.now())),
    packageName: MAIN_APP_PACKAGE,
    context: "main",
    attemptedLength: 0,
    attemptNumber: 1,
    outcome: "accepted",
  });
}
