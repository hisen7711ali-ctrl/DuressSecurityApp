import { copy } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";

export function useCopy() {
  const lang = useAppStore((s) => s.lang);
  return { lang, t: copy[lang], dir: lang === "ar" ? ("rtl" as const) : ("ltr" as const) };
}
