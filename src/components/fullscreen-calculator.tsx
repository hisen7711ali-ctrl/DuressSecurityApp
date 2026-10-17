import { useEffect, useRef, useState, type ComponentProps, type MouseEvent } from "react";
import { FakeCalculator as BaseCalculator } from "@/components/fake-calculator";
import { getCalculatorCommand, loadCalculatorCommand } from "@/lib/calculator-command";
import "@/styles/calculator-fullscreen.css";

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
      if (configuredMatch) {
        event.stopPropagation();
        props.onSecretCommand?.(`${calculatorCommand}=`);
      }
      sequenceRef.current = "";
      return;
    }

    if (/^\d$/.test(key)) {
      const next = `${sequenceRef.current}${key}`;
      if (calculatorCommand.startsWith(next)) {
        sequenceRef.current = next;
      } else {
        sequenceRef.current = calculatorCommand.startsWith(key) ? key : "";
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
