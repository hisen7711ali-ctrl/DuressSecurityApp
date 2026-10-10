import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

const SCI = ["(", ")", "π", "^", "√"];
const ROWS = [
  ["C", "⌫", "%", "/"],
  ["7", "8", "9", "*"],
  ["4", "5", "6", "-"],
  ["1", "2", "3", "+"],
  ["0", ".", "="],
] as const;

function evalExpr(raw: string): string {
  // Small arithmetic parser. It deliberately avoids eval/new Function so the decoy
  // calculator is compatible with a stricter WebView Content-Security-Policy.
  const tokens = raw.replaceAll("π", "PI").match(/PI|(?:\d+\.?\d*|\.\d+)|[()+\-*/^%√]/g) ?? [];
  if (tokens.join("") !== raw.replaceAll("π", "PI").replace(/\s+/g, "")) return "Error";
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
    if (token === "PI") return Math.PI;
    if (token !== undefined && /^(?:\d+\.?\d*|\.\d+)$/.test(token)) return Number(token);
    throw new Error("Expected number");
  };
  const power = (): number => {
    let value = primary();
    if (peek() === "^") { take(); value = value ** unary(); }
    return value;
  };
  const unary = (): number => {
    if (peek() === "+") { take(); return unary(); }
    if (peek() === "-") { take(); return -unary(); }
    if (peek() === "√") { take(); const value = unary(); return Math.sqrt(value); }
    let value = power();
    while (peek() === "%") { take(); value /= 100; }
    return value;
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
    return String(Number(result.toPrecision(10)));
  } catch {
    return "Error";
  }
}

export function FakeCalculator({ onOpenOwner }: { onOpenOwner: () => void }) {
  const { t, lang } = useCopy();
  const [expr, setExpr] = useState("");
  const [display, setDisplay] = useState("0");

  function tap(key: string) {
    if (key === "C") {
      setExpr("");
      setDisplay("0");
      return;
    }
    if (key === "⌫") {
      const next = expr.slice(0, -1);
      setExpr(next);
      setDisplay(next || "0");
      return;
    }
    if (key === "=") {
      const result = evalExpr(expr || display);
      setDisplay(result);
      setExpr(result === "Error" ? "" : result);
      return;
    }
    if (key === "√") {
      const next = `${expr}√(`;
      setExpr(next);
      setDisplay(next);
      return;
    }
    const next = expr === "0" ? key : expr + key;
    setExpr(next);
    setDisplay(next);
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col bg-navy px-4 pb-8 pt-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">{t.decoyTitle}</h1>
        <p className="text-sm text-muted">{t.decoyHint}</p>
      </header>
      <div className="mb-4 min-h-24 rounded-xl bg-surface px-4 py-5 text-end">
        <p className="truncate text-xs text-faint">{expr || " "}</p>
        <p className="mt-2 text-4xl font-semibold tabular-nums">{display}</p>
      </div>
      <div className="mb-2 grid grid-cols-5 gap-2">
        {SCI.map((k) => (
          <button key={k} type="button" onClick={() => tap(k)} className="h-11 rounded-md bg-surface-2 text-sm font-semibold text-muted">
            {k}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {ROWS.flatMap((row) =>
          row.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => tap(k)}
              className={cn(
                "h-14 rounded-md text-lg font-semibold",
                k === "0" && "col-span-2",
                k === "=" && "bg-cyan text-night",
                k === "C" && "bg-surface-2 text-danger",
                k !== "=" && k !== "C" && "bg-surface text-ink",
              )}
            >
              {k}
            </button>
          )),
        )}
      </div>
      <div className="mt-7 border-t border-white/10 pt-4 text-center">
        <button
          type="button"
          onClick={onOpenOwner}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/20 px-4 text-sm text-white/80 hover:bg-white/5"
        >
          <ShieldCheck className="size-4" />
          {lang === "ar" ? "فتح مساحة الحماية" : "Open security workspace"}
        </button>
        <p className="mt-2 text-xs text-white/45">
          {lang === "ar" ? "الحاسبة تعمل بشكل عادي. الدخول إلى مساحة الحماية يتطلب رمز المالك." : "Calculator works normally. The security workspace requires the owner PIN."}
        </p>
      </div>
    </div>
  );
}
