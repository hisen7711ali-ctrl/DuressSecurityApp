/**
 * SecurityService — pure logic for PIN classification and protection states.
 *
 * No React, no zustand, no DOM: everything takes plain values (and an optional
 * clock) so it can be unit-tested with `node --test` and reused anywhere.
 *
 * Scope: this is an APP-LEVEL protection layer. It does not read or intercept
 * the Android system PIN and cannot replace the system lock screen.
 */

export const EXTENDED_LOCK_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const MAX_PIN_LOCKOUT_MS = 24 * 60 * 60 * 1000; // cap escalating delay at 24 hours

/** Exponential delay after each full failed-attempt cycle; never wipes device data. */
export function nextLockoutDelayMs(baseDelaySeconds: number, escalationLevel: number): number {
  const base = Number.isFinite(baseDelaySeconds) && baseDelaySeconds > 0 ? Math.floor(baseDelaySeconds) : 20;
  const level = Number.isFinite(escalationLevel) ? Math.max(0, Math.min(13, Math.floor(escalationLevel))) : 0;
  return Math.min(base * 1000 * 2 ** level, MAX_PIN_LOCKOUT_MS);
}

export type PinAction = "unlock" | "wipe" | "extended-lock" | "duress" | "reject";

export type PinMap = {
  /** Normal unlock (default 0000). */
  master: string;
  /** Decoy PIN → in-app calculator; it does not hide the Android launcher icon. */
  duress: string;
  /** Extended lock PIN (default 5555) → 30-day lock. */
  lock: string;
  /** Emergency wipe PIN (default 7777). */
  format: string;
};

export const DEFAULT_PINS: PinMap = {
  master: "0000",
  duress: "4444",
  lock: "5555",
  format: "7777",
};

/** Persisted security state (small, serialisable, restored on every start). */
export type SecurityState = {
  /** Epoch ms when the extended lock ends. 0 = no extended lock active. */
  extendedLockUntil: number;
  /** Epoch ms when the extended lock was started (for display/audit). */
  extendedLockStartedAt: number;
};

export const INITIAL_SECURITY_STATE: SecurityState = {
  extendedLockUntil: 0,
  extendedLockStartedAt: 0,
};

/** Normalise Arabic-Indic and Persian numerals so keypad locale does not change a PIN. */
export function normalizePin(pin: string): string {
  return pin
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0));
}

/** Map a typed PIN to the action it triggers. Wrong PIN → "reject". */
export function classifyPin(pin: string, pins: PinMap): PinAction {
  const typed = normalizePin(pin);
  if (typed.length === 0) return "reject";
  // Order matters only if two PINs were configured identically; the most
  // destructive/restrictive wins deterministically: wipe > extended > duress > unlock.
  if (pins.format && typed === normalizePin(pins.format)) return "wipe";
  if (pins.lock && typed === normalizePin(pins.lock)) return "extended-lock";
  if (pins.duress && typed === normalizePin(pins.duress)) return "duress";
  if (typed === normalizePin(pins.master)) return "unlock";
  return "reject";
}

/** Returns an error key if the PIN set is invalid (duplicates among non-empty PINs). */
export function validatePins(pins: PinMap): "duplicate" | null {
  const used = [pins.master, pins.duress, pins.lock, pins.format].filter(Boolean).map(normalizePin);
  return new Set(used).size === used.length ? null : "duplicate";
}

/** Start a 30-day lock from `now`. Returns the new persisted state. */
export function startExtendedLock(now: number = Date.now(), durationMs: number = EXTENDED_LOCK_MS): SecurityState {
  return { extendedLockStartedAt: now, extendedLockUntil: now + durationMs };
}

/** Is the extended lock still in force at `now`? */
export function isExtendedLockActive(state: SecurityState, now: number = Date.now()): boolean {
  return state.extendedLockUntil > now;
}

/**
 * Reconcile persisted state on app start / reopen / clock tick.
 * - Expired lock → cleared automatically.
 * - Clock rolled back far before the start time → treated as tampering: the
 *   lock stays active and the end time is recomputed from the start time.
 */
export function reconcile(state: SecurityState, now: number = Date.now()): SecurityState {
  if (state.extendedLockUntil === 0) return state;
  if (state.extendedLockStartedAt > 0 && now < state.extendedLockStartedAt) {
    // clock moved backwards: don't shorten or extend, keep the original window
    return state;
  }
  if (state.extendedLockUntil <= now) return { ...INITIAL_SECURITY_STATE };
  return state;
}

export type Remaining = { totalMs: number; days: number; hours: number; minutes: number; seconds: number };

export function remainingTime(state: SecurityState, now: number = Date.now()): Remaining {
  const totalMs = Math.max(0, state.extendedLockUntil - now);
  const s = Math.floor(totalMs / 1000);
  return {
    totalMs,
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
  };
}

/**
 * Strict schema check for a decrypted persisted record. Native callers use this
 * before reconciliation so a valid JSON object with missing/invalid timestamps
 * cannot silently clear an active lock. The pure sanitizer below remains useful
 * for non-security display/migration paths, but it is not an integrity check.
 */
export function isValidSecurityStateRecord(raw: unknown): raw is SecurityState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const r = raw as Partial<SecurityState>;
  if (!Number.isSafeInteger(r.extendedLockUntil) || !Number.isSafeInteger(r.extendedLockStartedAt)) return false;
  const until = r.extendedLockUntil as number;
  const started = r.extendedLockStartedAt as number;
  if (until < 0 || started < 0) return false;
  if (until === 0) return started === 0;
  return started > 0 && until >= started;
}

/** Defensive parse of whatever was found in storage. */
export function sanitizeState(raw: unknown): SecurityState {
  const r = (raw ?? {}) as Partial<SecurityState>;
  const until = Number(r.extendedLockUntil);
  const started = Number(r.extendedLockStartedAt);
  return {
    extendedLockUntil: Number.isFinite(until) && until > 0 ? until : 0,
    extendedLockStartedAt: Number.isFinite(started) && started > 0 ? started : 0,
  };
}

/**
 * Clear only this app's namespaced browser data. This is deliberately NOT a
 * device wipe and it does not clear unrelated apps' origin storage. The
 * emergency PIN is a demo/app-data reset action; device factory reset is not
 * exposed by this project.
 */
export async function wipeAppData(opts: { preserveKeys?: string[] } = {}): Promise<void> {
  const preserve = new Set(opts.preserveKeys ?? []);
  const isOwnedKey = (key: string) =>
    key === "duress-security-app" || key === "duress-security-state" || key.startsWith("duress-security-app:") || key.startsWith("duress-security-vault");

  // Fail visibly if owned local storage cannot be removed: do not reset in-memory
  // state and falsely claim that persistent app data was cleared.
  if (typeof localStorage !== "undefined") {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && isOwnedKey(key) && !preserve.has(key)) localStorage.removeItem(key);
    }
  }
  if (typeof sessionStorage !== "undefined") {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key && isOwnedKey(key) && !preserve.has(key)) sessionStorage.removeItem(key);
    }
  }

  // IndexedDB database deletion is asynchronous. Await each result so UI success
  // is never reported before deletion has completed. A blocked request is a failure.
  if (typeof indexedDB !== "undefined") {
    const dbs = await indexedDB.databases?.();
    for (const db of dbs ?? []) {
      if (!db.name || !(db.name.startsWith("duress-security") || db.name.startsWith("duress-"))) continue;
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(db.name!);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error ?? new Error("OWNED_DATABASE_DELETE_FAILED"));
        request.onblocked = () => reject(new Error("OWNED_DATABASE_DELETE_BLOCKED"));
      });
    }
  }

  if (typeof caches !== "undefined") {
    const keys = await caches.keys();
    for (const key of keys) {
      if (key.startsWith("duress-security") || key.startsWith("duress-")) {
        const deleted = await caches.delete(key);
        if (!deleted) {
          // delete(false) can mean a concurrent removal, so only error if it remains.
          if ((await caches.keys()).includes(key)) throw new Error("OWNED_CACHE_DELETE_FAILED");
        }
      }
    }
  }
}
