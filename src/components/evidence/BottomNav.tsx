import { ClipboardCheck, Coins, Home, LayoutGrid, ListChecks, Plus, Vault } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type MainTab = "home" | "board" | "timeline" | "finances" | "vault" | "review";

const tabs: { id: MainTab; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "board", label: "Files", icon: LayoutGrid },
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
  const left = tabs.slice(0, 3);
  const right = tabs.slice(3);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_var(--border)] backdrop-blur-xl lg:hidden">
      <div className="mx-auto grid max-w-md grid-cols-7 items-end px-1 pt-1.5">

        {left.map((t) => (
          <TabButton key={t.id} t={t} active={tab === t.id} onClick={() => onTab(t.id)} />
        ))}
        <div className="flex justify-center">
          <Button
            onClick={onAdd}
            aria-label="Add"
            size="icon"
            className="-mt-4 size-13 rounded-full border-4 border-card shadow-lg active:scale-95"
          >
            <Plus className="size-6" />
          </Button>
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
    <Button
      variant="ghost"
      onClick={onClick}
      className={cn(
        "h-[58px] min-w-0 flex-col gap-1 rounded-md px-0 text-[9px] font-bold",
        active ? "bg-accent text-primary" : "text-muted-foreground",
      )}
    >
      <Icon className={cn("size-5", active && "stroke-[2.4]")} />
      {t.label}
    </Button>
  );
}

export { tabs as mainTabs };
