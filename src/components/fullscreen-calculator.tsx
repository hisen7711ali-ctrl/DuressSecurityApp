import { useEffect, useRef, useState, type ComponentProps, type MouseEvent } from "react";
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

  function handleCalculatorCapture(event: MouseEvent<HTMLDivElement>) {
    const button = (event.target as HTMLElement).closest("button");
    const key = button?.textContent?.trim();
    if (!key) return;

    if (key === "=") {
      const configuredMatch = sequenceRef.current === calculatorCommand;
      const legacyMatch = sequenceRef.current === LEGACY_CALCULATOR_COMMAND;
      event.stopPropagation();
      if (configuredMatch) props.onSecretCommand?.(`${LEGACY_CALCULATOR_COMMAND}=`);
      // If the owner changed the command, the old value is deliberately swallowed
      // and never forwarded to AppShell. It is not kept as a hidden alias.
      sequenceRef.current = "";
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
