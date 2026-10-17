import { useEffect, useState, type ComponentProps } from "react";
import { FakeCalculator as BaseCalculator } from "@/components/fake-calculator";
import { DEFAULT_CALCULATOR_COMMAND, getCalculatorCommand, loadCalculatorCommand } from "@/lib/calculator-command";
import "@/styles/calculator-fullscreen.css";

type Props = ComponentProps<typeof BaseCalculator>;

export function FakeCalculator(props: Props) {
  const [calculatorCommand, setCalculatorCommand] = useState(getCalculatorCommand());

  useEffect(() => {
    let cancelled = false;
    void loadCalculatorCommand().then((value) => {
      if (!cancelled) setCalculatorCommand(value || DEFAULT_CALCULATOR_COMMAND);
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="calculator-fullscreen-root">
      <BaseCalculator {...props} secretCommand={calculatorCommand} />
    </div>
  );
}
