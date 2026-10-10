import { Check, Delete } from "lucide-react";
import { cn } from "@/lib/utils";

const KEYS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["أ", "ي", "ع"],
  ["back", "0", "ok"],
] as const;

function tap() {
  try {
    navigator.vibrate?.(12);
  } catch {
    /* ignore */
  }
}

export function PinDots({ length, max = 4, shake }: { length: number; max?: number; shake?: boolean }) {
  return (
    <div
      className={cn("flex items-center justify-center gap-4", shake && "pin-shake")}
      aria-label={`${length} / ${max}`}
    >
      {Array.from({ length: max }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "size-4 rounded-full border-2 transition-colors duration-150",
            i < length ? "border-cyan bg-cyan" : "border-muted bg-transparent",
          )}
        />
      ))}
    </div>
  );
}

export function PinKeypad({
  value,
  onChange,
  onConfirm,
  disabled,
  compact,
  android,
}: {
  value: string;
  onChange: (next: string) => void;
  onConfirm: () => void;
  disabled?: boolean;
  compact?: boolean;
  /** Round, translucent keys that mimic the stock Android lock-screen keypad. */
  android?: boolean;
}) {
  function press(key: string) {
    if (disabled) return;
    tap();
    if (key === "back") {
      onChange(value.slice(0, -1));
      return;
    }
    if (key === "ok") {
      onConfirm();
      return;
    }
    if (value.length >= 4) return;
    onChange(value + key);
  }

  if (android) {
    const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "back", "0", "ok"] as const;
    return (
      <div className="flex flex-col items-center gap-3" dir="ltr">
        <div className="flex gap-3">
          {["أ", "ي", "ع"].map((ch) => (
            <button
              key={ch}
              type="button"
              disabled={disabled}
              onClick={() => press(ch)}
              className="key-press h-9 w-14 rounded-full bg-white/10 text-base text-white/90 backdrop-blur disabled:opacity-40"
            >
              {ch}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-x-5 gap-y-3">
          {digits.map((key) => {
            const isOk = key === "ok";
            const isBack = key === "back";
            return (
              <button
                key={key}
                type="button"
                disabled={disabled}
                onClick={() => press(key)}
                aria-label={isOk ? "OK" : isBack ? "Delete" : key}
                className={cn(
                  "key-press grid size-[68px] place-items-center rounded-full text-[28px] font-light tabular-nums text-white transition-colors duration-150 disabled:opacity-40",
                  isOk ? "bg-cyan text-night" : isBack ? "bg-transparent text-white/80" : "bg-white/10 backdrop-blur active:bg-white/25",
                )}
              >
                {isOk ? <Check className="size-6" /> : isBack ? <Delete className="size-6" /> : key}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("grid grid-cols-3", compact ? "gap-1.5" : "gap-2")}>
      {KEYS.flat().map((key) => {
        const isOk = key === "ok";
        const isBack = key === "back";
        return (
          <button
            key={key}
            type="button"
            disabled={disabled}
            onClick={() => press(key)}
            className={cn(
              "key-press rounded-md font-semibold tabular-nums transition-colors duration-150",
              compact ? "h-12 text-xl" : "h-14 text-2xl",
              isOk && "bg-cyan text-night",
              isBack && "bg-surface-2 text-muted",
              !isOk && !isBack && "bg-surface-2 text-ink hover:bg-line",
              disabled && "opacity-50",
            )}
          >
            {isOk ? <Check className="mx-auto size-5" /> : isBack ? <Delete className="mx-auto size-5" /> : key}
          </button>
        );
      })}
    </div>
  );
}
