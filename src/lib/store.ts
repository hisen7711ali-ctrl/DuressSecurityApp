import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { findApp, type DeviceApp } from "@/lib/apps";
import type { Lang } from "@/lib/i18n";
import { nowIso } from "@/lib/utils";
import {
  DEFAULT_PINS as SERVICE_DEFAULT_PINS,
  INITIAL_SECURITY_STATE,
  classifyPin as serviceClassifyPin,
  isExtendedLockActive,
  isValidSecurityStateRecord,
  reconcile,
  sanitizeState,
  startExtendedLock,
  validatePins,
  wipeAppData,
  normalizePin,
  nextLockoutDelayMs,
  EXTENDED_LOCK_MS,
  type SecurityState,
} from "@/lib/security-service";
import * as nativeBridge from "@/lib/native-bridge";
import { appStorage, getStoredValue, setStoredValue } from "@/lib/app-storage";
import { lockEncryptedVaultSession, persistEncryptedVault, unlockOrCreateEncryptedVault } from "@/lib/vault-crypto";

/** Separate key so the extended-lock state survives an emergency wipe and restarts. */
export const SECURITY_STORAGE_KEY = "duress-security-state";

async function loadSecurity(): Promise<SecurityState | null> {
  try {
    const raw = await getStoredValue(SECURITY_STORAGE_KEY);
    if (!raw) return { ...INITIAL_SECURITY_STATE };
    const parsed: unknown = JSON.parse(raw);
    if (!isValidSecurityStateRecord(parsed)) {
      // A decrypted but malformed record is not proof that the lock expired.
      // Native builds stop at the recovery screen; browser storage is demo-only.
      return nativeBridge.isNativeAndroid() ? null : sanitizeState(parsed);
    }
    return parsed;
  } catch {
    // On Android a storage error must not be converted into "no active lock".
    return nativeBridge.isNativeAndroid() ? null : { ...INITIAL_SECURITY_STATE };
  }
}
