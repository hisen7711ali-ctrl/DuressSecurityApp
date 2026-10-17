import * as nativeBridge from "@/lib/native-bridge";

export const SECURITY_AUDIT_STORAGE_KEY = "duress-security-failed-attempt-history";
export const MAIN_ATTEMPT_COUNTER_STORAGE_KEY = "duress-security-main-failed-attempt-count";
const MAX_AUDIT_RECORDS = 200;
const MAIN_APP_PACKAGE = "com.duresssecurity.app";

export type SecurityAttemptRecord = {
  at: number;
  packageName: string;
  context: "main" | "app";
  attemptedLength: number;
  attemptNumber: number;
  outcome: "rejected" | "rate-limited" | "accepted" | "baseline";
};

function validRecord(value: unknown): value is SecurityAttemptRecord {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<SecurityAttemptRecord>;
  return Number.isFinite(row.at) && typeof row.packageName === "string" &&
    (row.context === "main" || row.context === "app") &&
    Number.isInteger(row.attemptedLength) && (row.attemptedLength ?? -1) >= 0 && (row.attemptedLength ?? 99) <= 10 &&
    Number.isInteger(row.attemptNumber) && (row.attemptNumber ?? 0) >= 1 &&
    (row.outcome === "rejected" || row.outcome === "rate-limited" || row.outcome === "accepted" || row.outcome === "baseline");
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

function countMainFailuresAfterLastReset(records: SecurityAttemptRecord[]): number {
  let lastResetMarker = -1;
  for (let i = records.length - 1; i >= 0; i -= 1) {
    const record = records[i]!;
    if (
      record.context === "main" &&
      record.packageName === MAIN_APP_PACKAGE &&
      (record.outcome === "accepted" || record.outcome === "baseline")
    ) {
      lastResetMarker = i;
      break;
    }
  }
  if (lastResetMarker < 0) return 0;
  return records.slice(lastResetMarker + 1).filter((record) =>
    record.context === "main" &&
    record.packageName === MAIN_APP_PACKAGE &&
    (record.outcome === "rejected" || record.outcome === "rate-limited"),
  ).length;
}

/** Never fall back to plaintext local storage if the Android secure store is unavailable. */
export async function loadFailedAttemptHistory(): Promise<SecurityAttemptRecord[] | null> {
  const journal = await readJournal();
  return journal === null ? null : journal.records.filter((record) =>
    record.outcome === "rejected" || record.outcome === "rate-limited",
  );
}

/**
 * The main-lock counter is stored separately from the bounded display journal,
 * so hundreds of app-lock events cannot evict the counter's reset marker. The
 * journal is only used once to migrate older installs which have no counter key.
 * null means the secure store could not be verified.
 */
export async function loadConsecutiveMainFailedAttempts(): Promise<number | null> {
  if (!nativeBridge.isNativeAndroid()) return null;
  const counterRead = await nativeBridge.secureStorageGet(MAIN_ATTEMPT_COUNTER_STORAGE_KEY);
  if (!counterRead.available && counterRead.reason !== "KEY_MISSING") return null;

  if (counterRead.found) {
    const rawCount = counterRead.value?.trim();
    if (!rawCount || !/^\\d+$/.test(rawCount)) return null;
    const count = Number(rawCount);
    return Number.isSafeInteger(count) && count >= 0 && count <= 1_000_000 ? count : null;
  }

  const journal = await readJournal();
  if (journal === null) return null;
  const migratedCount = countMainFailuresAfterLastReset(journal.records);
  const saved = await nativeBridge.secureStorageSet(MAIN_ATTEMPT_COUNTER_STORAGE_KEY, String(migratedCount));
  return saved ? migratedCount : null;
}

/** Store metadata only; the attempted PIN itself is never retained. */
export async function recordFailedAttempt(input: Omit<SecurityAttemptRecord, "at" | "outcome"> & {
  at?: number;
  outcome: "rejected" | "rate-limited";
}): Promise<boolean> {
  let attemptNumber = Math.max(1, Math.floor(input.attemptNumber));
  if (input.context === "main") {
    const previous = await loadConsecutiveMainFailedAttempts();
    if (previous === null) return false;
    attemptNumber = Math.min(1_000_000, previous + 1);
    if (!(await nativeBridge.secureStorageSet(MAIN_ATTEMPT_COUNTER_STORAGE_KEY, String(attemptNumber)))) return false;
  }
  return writeRecord({
    at: Math.max(0, Math.floor(input.at ?? Date.now())),
    packageName: input.packageName.slice(0, 240),
    context: input.context,
    attemptedLength: Math.max(0, Math.min(10, Math.floor(input.attemptedLength))),
    attemptNumber,
    outcome: input.outcome,
  });
}

/** Reset the independent restart-safe counter after verified owner unlock. */
export async function recordSuccessfulMainUnlock(): Promise<boolean> {
  if (!nativeBridge.isNativeAndroid()) return false;
  if (!(await nativeBridge.secureStorageSet(MAIN_ATTEMPT_COUNTER_STORAGE_KEY, "0"))) return false;
  return writeRecord({
    at: Math.max(0, Math.floor(Date.now())),
    packageName: MAIN_APP_PACKAGE,
    context: "main",
    attemptedLength: 0,
    attemptNumber: 1,
    outcome: "accepted",
  });
}
