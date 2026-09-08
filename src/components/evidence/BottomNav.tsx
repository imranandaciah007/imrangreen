import { ClipboardCheck, Coins, Home, ListChecks, Plus, Vault } from "lucide-react";

import { cn } from "@/lib/utils";

export type MainTab = "home" | "timeline" | "finances" | "vault" | "review";

const tabs: { id: MainTab; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "timeline", label: "Timeline", icon: ListChecks },
  { id: "finances", label: "Finances", icon: Coins },
  { id: "vault", label: "Vault", icon: Vault },
  { id: "review", label: "Review", icon: ClipboardCheck },
];

export function BottomNav({
  tab,
  onTab,
  onAdd,
}: {
  tab: MainTab;
  onTab: (t: MainTab) => void;
  onAdd: () => void;
}) {
  const left = tabs.slice(0, 2);
  const right = tabs.slice(2);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_var(--border)] backdrop-blur-xl lg:hidden">
      <div className="mx-auto grid max-w-md grid-cols-6 items-end px-1 pt-1.5">
        {left.map((t) => (
          <TabButton key={t.id} t={t} active={tab === t.id} onClick={() => onTab(t.id)} />
        ))}
        <div className="flex justify-center">
          <button
            onClick={onAdd}
            aria-label="Add"
            className="-mt-5 flex size-14 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-panel transition-transform active:scale-95"
          >
            <Plus className="size-7" />
          </button>
        </div>
        {right.map((t) => (
          <TabButton key={t.id} t={t} active={tab === t.id} onClick={() => onTab(t.id)} />
        ))}
      </div>
    </nav>
  );
}

function TabButton({
  t,
  active,
  onClick,
}: {
  t: { id: MainTab; label: string; icon: typeof Home };
  active: boolean;
  onClick: () => void;
}) {
  const Icon = t.icon;
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-bold",
        active ? "bg-accent/70 text-primary" : "text-muted-foreground",
      )}
    >
      <Icon className={cn("size-5", active && "stroke-[2.4]")} />
      {t.label}
    </button>
  );
}

export { tabs as mainTabs };
