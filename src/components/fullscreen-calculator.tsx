import { useEffect, useRef, useState } from "react";
import type { ComponentProps } from "react";
import { FakeCalculator as BaseCalculator } from "@/components/fake-calculator";
import { DEFAULT_CALCULATOR_COMMAND, getCalculatorCommand, loadCalculatorCommand } from "@/lib/calculator-command";
import "@/styles/calculator-fullscreen.css";

const LEGACY_CALCULATOR_COMMAND = DEFAULT_CALCULATOR_COMMAND;

type Props = ComponentProps<typeof BaseCalculator>;

export function FakeCalculator(props: Props) {
  const [calculatorCommand, setCalculatorCommand] = useState(getCalculatorCommand());
  const sequenceRef = useRef("");

  useEffect(() => {
    let cancelled = false;
    void loadCalculatorCommand().then((value) => {
      if (!cancelled) setCalculatorCommand(value);
    });
    return () => { cancelled = true; };
  }, []);

  function handleCalculatorCapture(event: React.MouseEvent<HTMLDivElement>) {
    const button = (event.target as HTMLElement).closest("button");
    const key = button?.textContent?.trim();
    if (!key) return;

    if (key === "=") {
      const configuredMatch = sequenceRef.current === calculatorCommand;
      const legacyMatch = sequenceRef.current === LEGACY_CALCULATOR_COMMAND;
      if (configuredMatch || legacyMatch) {
        // The underlying calculator still owns the normal UI/calculation logic.
        // We intercept only the secret command so the old hard-coded trigger can
        // never remain usable after the owner changes it in Settings.
        event.stopPropagation();
        sequenceRef.current = "";
        props.onSecretCommand?.(`${LEGACY_CALCULATOR_COMMAND}=`);
      } else {
        sequenceRef.current = "";
      }
      return;
    }

    if (/^\d$/.test(key)) {
      const next = `${sequenceRef.current}${key}`;
      if (calculatorCommand.startsWith(next) || LEGACY_CALCULATOR_COMMAND.startsWith(next)) {
        sequenceRef.current = next;
      } else {
        sequenceRef.current = calculatorCommand.startsWith(key) || LEGACY_CALCULATOR_COMMAND.startsWith(key) ? key : "";
      }
      return;
    }

    sequenceRef.current = "";
  }

  return (
    <div className="calculator-fullscreen-root" onClickCapture={handleCalculatorCapture}>
      <BaseCalculator {...props} />
    </div>
  );
}
