import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function nowIso() {
  return new Date().toISOString();
}

export function formatRelative(iso: string, lang: "ar" | "en") {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  if (diff < 60_000) return lang === "ar" ? "الآن" : "Just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) {
    return lang === "ar" ? `قبل ${mins} د` : `${mins}m ago`;
  }
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    return lang === "ar" ? `قبل ${hours} س` : `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return lang === "ar" ? `قبل ${days} يوم` : `${days}d ago`;
}
