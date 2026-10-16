import { getStoredValue, setStoredValue } from "@/lib/app-storage";

export const DEFAULT_CALCULATOR_COMMAND = "20272006";
export const CALCULATOR_COMMAND_STORAGE_KEY = "duress-security-app:calculator-command";

let cachedCommand = DEFAULT_CALCULATOR_COMMAND;

export function normalizeCalculatorCommand(value: string): string {
  return value
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0));
}

export function getCalculatorCommand(): string {
  return cachedCommand;
}

export async function loadCalculatorCommand(): Promise<string> {
  try {
    const stored = await getStoredValue(CALCULATOR_COMMAND_STORAGE_KEY);
    const normalized = normalizeCalculatorCommand(stored ?? "");
    if (stored === null) cachedCommand = DEFAULT_CALCULATOR_COMMAND;
    else if (/^\d{8}$/.test(normalized)) cachedCommand = normalized;
  } catch {
    // Keep the last known safe command. Android secure storage remains the source of truth.
  }
  return cachedCommand;
}

export async function setCalculatorCommand(value: string): Promise<boolean> {
  const normalized = normalizeCalculatorCommand(value);
  if (!/^\d{8}$/.test(normalized)) return false;
  const saved = await setStoredValue(CALCULATOR_COMMAND_STORAGE_KEY, normalized);
  if (!saved) return false;
  cachedCommand = normalized;
  return true;
}
