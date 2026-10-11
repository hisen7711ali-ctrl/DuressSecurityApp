import { useEffect, useState } from "react";
import { Delete, Equal } from "lucide-react";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

const ROWS = [
  ["AC", "±", "%", "÷"],
  ["7", "8", "9", "×"],
  ["4", "5", "6", "−"],
  ["1", "2", "3", "+"],
  ["0", ".", "="],
] as const;

type SecretCommandHandler = (sequence: string) => boolean;

function evalExpr(raw: string): string {
  const normalized = raw.replaceAll("×", "*").replaceAll("÷", "/").replaceAll("−", "-");
  const tokens = normalized.match(/(?:\d+\.?\d*|\.\d+)|[()+\-*/%]/g) ?? [];
  if (tokens.join("") !== normalized.replace(/\s+/g, "")) return "Error";

  let pos = 0;
  const peek = () => tokens[pos];
  const take = () => tokens[pos++];

  const primary = (): number => {
    const token = take();
    if (token === "(") {
      const value = expression();
      if (take() !== ")") throw new Error("Missing closing parenthesis");
      return value;
    }
    if (token !== undefined && /^(?:\d+\.?\d*|\.\d+)$/.test(token)) return Number(token);
    throw new Error("Expected number");
  };

  const unary = (): number => {
    if (peek() === "+") { take(); return unary(); }
    if (peek() === "-") { take(); return -unary(); }
    return primary();
  };

  const term = (): number => {
    let value = unary();
    while (peek() === "*" || peek() === "/") {
      const op = take();
      const right = unary();
      value = op === "*" ? value * right : value / right;
    }
    return value;
  };

  const expression = (): number => {
    let value = term();
    while (peek() === "+" || peek() === "-") {
      const op = take();
      const right = term();
      value = op === "+" ? value + right : value - right;
    }
    return value;
  };

  try {
    if (!tokens.length) return "0";
    const result = expression();
    if (pos !== tokens.length || !Number.isFinite(result)) return "Error";
    return String(Number(result.toPrecision(12)));
  } catch {
    return "Error";
  }
}

function CalculatorButton({ label, onClick, tone = "number", wide = false }: {
  label: string;
  onClick: () => void;
  tone?: "number" | "utility" | "operator" | "equals";
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex min-h-14 touch-manipulation items-center justify-center rounded-full text-[clamp(1.05rem,4.8vw,1.45rem)] font-medium transition-transform active:scale-[0.96] sm:min-h-16",
        wide && "col-span-2 justify-start pl-7",
        tone === "number" && "bg-surface text-ink",
        tone === "utility" && "bg-surface-2 text-muted",
        tone === "operator" && "bg-surface-2 text-cyan",
        tone === "equals" && "bg-cyan text-night",
      )}
    >
      {label === "⌫" ? <Delete className="size-5" aria-hidden="true" /> : label === "=" ? <Equal className="size-5" aria-hidden="true" /> : label}
    </button>
  );
}

export function FakeCalculator({
  onOpenOwner,
  onSecretCommand,
}: {
  onOpenOwner: () => void;
  onSecretCommand?: SecretCommandHandler;
}) {
  const { lang } = useCopy();
  const [expr, setExpr] = useState("");
  const [display, setDisplay] = useState("0");
  const [secretVisible, setSecretVisible] = useState(false);
  const [commandSequence, setCommandSequence] = useState("");

  useEffect(() => {
    if (!secretVisible) return;
    const id = window.setTimeout(() => setSecretVisible(false), 5000);
    return () => window.clearTimeout(id);
  }, [secretVisible]);

  function tap(key: string) {
    if (key === "AC") {
      setExpr("");
      setDisplay("0");
      setCommandSequence("");
      setSecretVisible(false);
      return;
    }

    // Owner entry is exactly %, +, = from a clean calculator. The sequence is
    // kept outside calculator state so it never appears on the calculator display.
    if (expr === "" && commandSequence === "" && key === "%") {
      setCommandSequence("%");
      return;
    }
    if (commandSequence === "%" && key === "+") {
      setCommandSequence("%+");
      return;
    }
    if (commandSequence === "%+" && key === "=") {
      const handled = onSecretCommand?.("%+=") ?? false;
      if (handled) setSecretVisible(true);
      setCommandSequence("");
      setExpr("");
      setDisplay("0");
      return;
    }
    if (commandSequence) setCommandSequence("");

    if (key === "±") {
      const next = expr.startsWith("-") ? expr.slice(1) : expr ? `-${expr}` : "-";
      setExpr(next);
      setDisplay(next || "0");
      return;
    }
    if (key === "%") {
      if (!expr) return;
      const next = `${expr}%`;
      const numeric = Number.parseFloat(expr);
      if (Number.isFinite(numeric)) {
        const result = String(numeric / 100);
        setExpr(result);
        setDisplay(result);
      } else {
        setExpr(next);
        setDisplay(next);
      }
      return;
    }
    if (key === "=") {
      const result = evalExpr(expr || display);
      setDisplay(result);
      setExpr(result === "Error" ? "" : result);
      return;
    }

    const operator = ["+", "−", "×", "÷"].includes(key);
    const last = expr.at(-1);
    if (operator && last && ["+", "−", "×", "÷"].includes(last)) {
      const next = expr.slice(0, -1) + key;
      setExpr(next);
      setDisplay(next);
      return;
    }

    const next = expr === "0" && !operator ? key : expr + key;
    setExpr(next);
    setDisplay(next);
  }

  return (
    <div className="flex min-h-dvh w-full flex-col bg-navy px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <header className="flex items-center justify-end px-2 py-2">
        <div className="text-end">
          <h1 className="text-xl font-semibold tracking-tight text-ink">{lang === "ar" ? "الآلة الحاسبة" : "Calculator"}</h1>
          <p className="text-xs text-muted">{lang === "ar" ? "حاسبة بسيطة" : "Standard calculator"}</p>
        </div>
      </header>

      <main className="mx-auto mt-auto w-full max-w-2xl">
        <section className="mb-3 min-h-[clamp(8rem,26vh,12rem)] rounded-[1.6rem] bg-surface px-5 py-5 text-end shadow-panel" aria-label={lang === "ar" ? "شاشة الحاسبة" : "Calculator display"}>
          <p className="min-h-6 truncate text-sm text-faint" dir="ltr">{expr || " "}</p>
          <p className="mt-2 overflow-x-auto whitespace-nowrap text-[clamp(2.5rem,12vw,4rem)] font-light leading-none tracking-tight tabular-nums" dir="ltr">
            {display}
          </p>
        </section>

        <div className="grid grid-cols-4 gap-2.5 sm:gap-3">
          {ROWS.flatMap((row, rowIndex) => row.map((key) => {
            const tone = key === "=" ? "equals" : ["÷", "×", "−", "+"].includes(key) ? "operator" : rowIndex === 0 ? "utility" : "number";
            return (
              <CalculatorButton
                key={key}
                label={key}
                tone={tone as "number" | "utility" | "operator" | "equals"}
                wide={key === "0"}
                onClick={() => tap(key)}
              />
            );
          }))}
        </div>

        <div className="relative mt-4 flex min-h-10 items-center justify-center">
          {secretVisible ? (
            <button
              type="button"
              onClick={() => {
                setSecretVisible(false);
                onOpenOwner();
              }}
              className="min-h-10 rounded-full bg-surface px-5 text-xs font-semibold text-cyan shadow-panel transition-transform active:scale-95"
              aria-label={lang === "ar" ? "متابعة" : "Continue"}
            >
              {lang === "ar" ? "متابعة" : "Continue"}
            </button>
          ) : null}
        </div>
      </main>
    </div>
  );
}
