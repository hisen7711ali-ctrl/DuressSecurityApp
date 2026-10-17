import { useAppStore } from "@/lib/store";
import { syncDirectBootPolicy } from "@/lib/native-bridge";

let installed = false;
let timer: number | null = null;

export function installDirectBootPolicySync(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  let last = "";
  const push = () => {
    const state = useAppStore.getState();
    const payload = JSON.stringify({ enabled: state.appLockEnabled, packages: [...state.lockedPackages].sort() });
    if (payload === last) return;
    last = payload;
    void syncDirectBootPolicy(state.appLockEnabled, state.lockedPackages);
  };
  push();
  useAppStore.subscribe(() => {
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(() => { timer = null; push(); }, 150);
  });
}
