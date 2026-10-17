import type { Lang } from "@/lib/i18n";
import type { PinKind } from "@/lib/store";
import { copy } from "@/lib/i18n";

export function pinKindTitle(lang: Lang, kind: PinKind): string {
  const t = copy[lang];
  const map: Record<PinKind, string> = {
    master: t.masterPin,
    duress: t.duressPin,
    lock: t.lockPin,
    format: t.formatPin,
  };
  return map[kind];
}
