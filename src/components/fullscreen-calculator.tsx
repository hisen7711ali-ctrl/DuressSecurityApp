import type { ComponentProps } from "react";
import { FakeCalculator as BaseCalculator } from "@/components/fake-calculator";
import "@/styles/calculator-fullscreen.css";

export function FakeCalculator(props: ComponentProps<typeof BaseCalculator>) {
  return (
    <div className="calculator-fullscreen-root">
      <BaseCalculator {...props} />
    </div>
  );
}
