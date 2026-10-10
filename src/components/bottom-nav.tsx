import { FolderLock, Home, Settings, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCopy } from "@/lib/use-copy";
import { useAppStore, type TabId } from "@/lib/store";

const TABS: { id: TabId; icon: typeof Home; label: "home" | "protection" | "files" | "settings" }[] = [
  { id: "home", icon: Home, label: "home" },
  { id: "protect", icon: Shield, label: "protection" },
  { id: "files", icon: FolderLock, label: "files" },
  { id: "settings", icon: Settings, label: "settings" },
];

export function BottomNav() {
  const { t } = useCopy();
  const tab = useAppStore((s) => s.tab);
  const setTab = useAppStore((s) => s.setTab);

  return (
    <nav className="grid grid-cols-4 rounded-xl border border-line bg-surface px-1 py-2">
      {TABS.map((item) => {
        const Icon = item.icon;
        const active = tab === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              "flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-xs font-medium transition-colors",
              active ? "text-cyan" : "text-muted",
            )}
          >
            <Icon className={cn("size-5", active && "fill-cyan/15")} />
            {t[item.label]}
          </button>
        );
      })}
    </nav>
  );
}
