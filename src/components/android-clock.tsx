import { useEffect, useState } from "react";

/** Big lock-screen clock + date, like the stock Android lock screen. */
export function AndroidClock({ lang }: { lang: "ar" | "en" }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const locale = lang === "ar" ? "ar-EG" : "en-US";
  const time = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", hour12: false }).format(now);
  const date = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(now);

  return (
    <div className="flex flex-col items-center text-center" dir="ltr">
      <p className="text-[76px] font-light leading-none tracking-tight tabular-nums text-white drop-shadow-lg">{time}</p>
      <p className="mt-2 text-base font-medium text-white/85" dir={lang === "ar" ? "rtl" : "ltr"}>
        {date}
      </p>
    </div>
  );
}

/** Minimal status bar (clock left, battery/signal glyphs right) to match the native look. */
export function StatusBar() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 15000);
    return () => window.clearInterval(id);
  }, []);
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: false }).format(now);
  return (
    <div className="flex items-center justify-between px-5 pt-[max(0.5rem,env(safe-area-inset-top))] text-xs font-medium text-white/90" dir="ltr">
      <span className="tabular-nums">{time}</span>
      <span className="flex items-center gap-1.5" aria-hidden>
        <svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor"><path d="M1 12h2V9H1v3Zm4 0h2V6H5v6Zm4 0h2V3H9v9Zm4 0h2V1h-2v11Z" /></svg>
        <svg viewBox="0 0 24 12" className="h-3 w-6" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="1" y="1" width="19" height="10" rx="2.5" /><rect x="3" y="3" width="13" height="6" rx="1" fill="currentColor" stroke="none" /><path d="M22 4v4" strokeLinecap="round" /></svg>
      </span>
    </div>
  );
}
