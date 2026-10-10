import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { FAITH_QUOTES } from "@/lib/quotes";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

export function QuotesBanner({ compact }: { compact?: boolean }) {
  const { t } = useCopy();
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const id = window.setInterval(() => {
      setVisible(false);
      window.setTimeout(() => {
        setIndex((i) => (i + 1) % FAITH_QUOTES.length);
        setVisible(true);
      }, 220);
    }, 5000);
    return () => window.clearInterval(id);
  }, []);

  const quote = (
    <p
      className={cn(
        "quote-font text-center leading-relaxed text-ink transition-opacity duration-200",
        compact ? "text-sm" : "text-base",
      )}
      style={{ opacity: visible ? 1 : 0 }}
    >
      {FAITH_QUOTES[index]}
    </p>
  );

  if (compact) {
    return (
      <section className="rounded-xl border border-line bg-surface/90 px-4 py-3">
        <div className="mb-2 flex items-center justify-between text-cyan">
          <span className="text-xs font-semibold">{t.lights}</span>
          <Sparkles className="size-3.5" />
        </div>
        {quote}
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between text-cyan">
        <span className="text-sm font-semibold">{t.lights}</span>
        <Sparkles className="size-4" />
      </div>
      <div className="flex min-h-24 items-center justify-center rounded-lg bg-navy px-4 py-4">{quote}</div>
    </section>
  );
}
