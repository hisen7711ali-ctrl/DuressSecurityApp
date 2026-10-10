const EASTERN = "٠١٢٣٤٥٦٧٨٩";
const ALLOWED = /[0-9أيع]/;

export function normalizePinChar(raw: string): string {
  if (!raw) return "";
  if (raw.length === 1) {
    const east = EASTERN.indexOf(raw);
    if (east >= 0) return String(east);
    if (ALLOWED.test(raw)) return raw;
  }
  return "";
}

export function normalizePin(input: string): string {
  let out = "";
  for (const ch of input.trim()) {
    const n = normalizePinChar(ch);
    if (n) out += n;
    if (out.length === 4) break;
  }
  return out;
}

export const PIN_KEYS = "0123456789أيع";
