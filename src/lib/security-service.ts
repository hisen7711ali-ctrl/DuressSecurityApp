/**
 * SecurityService — pure logic for PIN classification and protection states.
 *
 * No React, no zustand, no DOM: everything takes plain values (and an optional
 * clock) so it can be unit-tested with `node --test` and reused anywhere.
 *
 * Scope: this is an APP-LEVEL protection layer. It does not read or intercept
 * the Android system PIN and cannot replace the system lock screen.
 */

export const EXTENDED_LOCK_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_PIN_LOCKOUT_MS = 24 * 60 * 60 * 1000;

export function nextLockoutDelayMs(baseDelaySeconds: number, escalationLevel: number): number {
  const base = Number.isFinite(baseDelaySeconds) && baseDelaySeconds > 0 ? Math.floor(baseDelaySeconds) : 20;
  const level = Number.isFinite(escalationLevel) ? Math.max(0, Math.min(13, Math.floor(escalationLevel))) : 0;
  return Math.min(base * 1000 * 2 ** level, MAX_PIN_LOCKOUT_MS);
}

export type PinAction = "unlock" | "wipe" | "extended-lock" | "duress" | "reject";

export type PinMap = {
  master: string;
  duress: string;
  lock: string;
  format: string;
};

export const DEFAULT_PINS: PinMap = {
  master: "0000",
  duress: "4444",
  lock: "5555",
  format: "7777",
};

export type SecurityState = {
  extendedLockUntil: number;
  extendedLockStartedAt: number;
};

export const INITIAL_SECURITY_STATE: SecurityState = {
  extendedLockUntil: 0,
  extendedLockStartedAt: 0,
};

export function normalizePin(pin: string): string {
  return pin
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0));
}

/** Map a typed PIN to an action. The configured master PIN always wins. */
export function classifyPin(pin: string, pins: PinMap): PinAction {
  const typed = normalizePin(pin);
  if (typed.length === 0) return "reject";
  if (typed === normalizePin(pins.master)) return "unlock";
  if (pins.format && typed === normalizePin(pins.format)) return "wipe";
  if (pins.lock && typed === normalizePin(pins.lock)) return "extended-lock";
  if (pins.duress && typed === normalizePin(pins.duress)) return "duress";
  return "reject";
}

export function validatePins(pins: PinMap): "duplicate" | null {
  const used = [pins.master, pins.duress, pins.lock, pins.format].filter(Boolean).map(normalizePin);
  return new Set(used).size === used.length ? null : "duplicate";
}

export function startExtendedLock(now: number = Date.now(), durationMs: number = EXTENDED_LOCK_MS): SecurityState {
  return { extendedLockStartedAt: now, extendedLockUntil: now + durationMs };
}

export function isExtendedLockActive(state: SecurityState, now: number = Date.now()): boolean {
  return state.extendedLockUntil > now;
}

export function reconcile(state: SecurityState, now: number = Date.now()): SecurityState {
  if (state.extendedLockUntil === 0) return state;
  if (state.extendedLockStartedAt > 0 && now < state.extendedLockStartedAt) return state;
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

export function sanitizeState(raw: unknown): SecurityState {
  const r = (raw ?? {}) as Partial<SecurityState>;
  const until = Number(r.extendedLockUntil);
  const started = Number(r.extendedLockStartedAt);
  return {
    extendedLockUntil: Number.isFinite(until) && until > 0 ? until : 0,
    extendedLockStartedAt: Number.isFinite(started) && started > 0 ? started : 0,
  };
}

export async function wipeAppData(opts: { preserveKeys?: string[] } = {}): Promise<void> {
  const preserve = new Set(opts.preserveKeys ?? []);
  const isOwnedKey = (key: string) =>
    key === "duress-security-app" || key === "duress-security-state" || key.startsWith("duress-security-app:") || key.startsWith("duress-security-app-lock-") || key.startsWith("duress-security-applock-") || key.startsWith("duress-security-vault");
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
  if (typeof indexedDB !== "undefined") {
    // Delete the known vault attachment database even on WebViews that do not
    // implement indexedDB.databases(); all records are encrypted, but reset must
    // remove their remaining ciphertext too.
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase("duress-security-vault-attachments");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("OWNED_ATTACHMENT_DATABASE_DELETE_FAILED"));
      request.onblocked = () => reject(new Error("OWNED_ATTACHMENT_DATABASE_DELETE_BLOCKED"));
    });
    const dbs = await indexedDB.databases?.();
    for (const db of dbs ?? []) {
      if (!db.name || !(db.name.startsWith("duress-security") || db.name.startsWith("duress-"))) continue;
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.deleteDatabase(db.name!);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error ?? new Error("IndexedDB deletion failed"));
        req.onblocked = () => reject(new Error("OWNED_DATABASE_DELETE_BLOCKED"));
      });
    }
  }
  if (typeof caches !== "undefined") {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("duress-security") || key.startsWith("duress-")).map((key) => caches.delete(key)));
  }
}
