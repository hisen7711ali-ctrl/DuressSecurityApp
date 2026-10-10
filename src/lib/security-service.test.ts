import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PINS,
  EXTENDED_LOCK_MS,
  INITIAL_SECURITY_STATE,
  classifyPin,
  normalizePin,
  nextLockoutDelayMs,
  MAX_PIN_LOCKOUT_MS,
  isExtendedLockActive,
  isValidSecurityStateRecord,
  reconcile,
  remainingTime,
  sanitizeState,
  startExtendedLock,
  validatePins,
} from "./security-service.ts";

test("0000 unlocks normally in Western and Arabic-Indic numerals", () => {
  assert.equal(classifyPin("0000", DEFAULT_PINS), "unlock");
  assert.equal(classifyPin("٠٠٠٠", DEFAULT_PINS), "unlock");
  assert.equal(classifyPin("۰۰۰۰", DEFAULT_PINS), "unlock");
  assert.equal(normalizePin("٧٧٧٧"), "7777");
});
test("7777 selects app-owned demo-data wipe only", () => assert.equal(classifyPin("7777", DEFAULT_PINS), "wipe"));
test("5555 triggers extended lock", () => assert.equal(classifyPin("5555", DEFAULT_PINS), "extended-lock"));
test("4444 opens the in-app calculator mode", () => assert.equal(classifyPin("4444", DEFAULT_PINS), "duress"));
test("any other PIN is rejected", () => {
  for (const p of ["1234", "8888", "0001", "أ111", "5556", "4445"]) assert.equal(classifyPin(p, DEFAULT_PINS), "reject");
});
test("duress PIN can be customised", () => {
  assert.equal(classifyPin("4321", DEFAULT_PINS), "reject");
  assert.equal(classifyPin("4321", { ...DEFAULT_PINS, duress: "4321" }), "duress");
});
test("duplicate PINs are detected", () => {
  assert.equal(validatePins(DEFAULT_PINS), null);
  assert.equal(validatePins({ ...DEFAULT_PINS, lock: "0000" }), "duplicate");
  assert.equal(validatePins({ ...DEFAULT_PINS, lock: "٠٠٠٠" }), "duplicate");
});

test("extended lock lasts exactly 30 days and is active", () => {
  const t0 = Date.UTC(2026, 9, 9);
  const s = startExtendedLock(t0);
  assert.equal(s.extendedLockUntil - t0, 30 * 24 * 3600 * 1000);
  assert.equal(isExtendedLockActive(s, t0 + 1), true);
  assert.equal(isExtendedLockActive(s, t0 + EXTENDED_LOCK_MS - 1), true);
});
test("lock survives reopen/restart (persisted state round-trips through JSON)", () => {
  const t0 = 1_000_000;
  const saved = JSON.stringify(startExtendedLock(t0));
  const restored = reconcile(sanitizeState(JSON.parse(saved)), t0 + 5 * 24 * 3600 * 1000);
  assert.equal(isExtendedLockActive(restored, t0 + 5 * 24 * 3600 * 1000), true);
  assert.equal(remainingTime(restored, t0 + 5 * 24 * 3600 * 1000).days, 25);
});
test("lock ends automatically after expiry", () => {
  const t0 = 1_000_000;
  const s = reconcile(startExtendedLock(t0), t0 + EXTENDED_LOCK_MS);
  assert.deepEqual(s, INITIAL_SECURITY_STATE);
  assert.equal(isExtendedLockActive(s, t0 + EXTENDED_LOCK_MS), false);
});
test("clock rolled back does not release the lock", () => {
  const t0 = 10_000_000;
  const s = reconcile(startExtendedLock(t0), t0 - 1_000_000);
  assert.equal(isExtendedLockActive(s, t0 - 1_000_000), true);
});
test("corrupted storage is sanitised to 'no lock'", () => {
  assert.deepEqual(sanitizeState({ extendedLockUntil: "abc" }), INITIAL_SECURITY_STATE);
  assert.deepEqual(sanitizeState(null), INITIAL_SECURITY_STATE);
});

test("security record validation rejects valid JSON with missing or impossible lock timestamps", () => {
  assert.equal(isValidSecurityStateRecord(INITIAL_SECURITY_STATE), true);
  assert.equal(isValidSecurityStateRecord(startExtendedLock(1_000_000)), true);
  assert.equal(isValidSecurityStateRecord({}), false);
  assert.equal(isValidSecurityStateRecord({ extendedLockUntil: 0, extendedLockStartedAt: 123 }), false);
  assert.equal(isValidSecurityStateRecord({ extendedLockUntil: 123, extendedLockStartedAt: 456 }), false);
  assert.equal(isValidSecurityStateRecord({ extendedLockUntil: "999999", extendedLockStartedAt: 1 }), false);
});


test("repeated wrong PIN cycles increase persisted lockout duration up to 24 hours", () => {
  assert.equal(nextLockoutDelayMs(20, 0), 20_000);
  assert.equal(nextLockoutDelayMs(20, 1), 40_000);
  assert.equal(nextLockoutDelayMs(20, 2), 80_000);
  assert.equal(nextLockoutDelayMs(20, 13), MAX_PIN_LOCKOUT_MS);
  assert.equal(nextLockoutDelayMs(20, 99), MAX_PIN_LOCKOUT_MS);
});
