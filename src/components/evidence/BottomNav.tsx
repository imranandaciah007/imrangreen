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
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_var(--border)] backdrop-blur-xl lg:hidden"
      aria-label="Main navigation"
    >
      <div className="mx-auto grid max-w-md grid-cols-[minmax(0,1fr)_4rem_minmax(0,1fr)] items-end gap-1 px-2 pt-2">
        <div className="grid min-w-0 grid-cols-3 items-end">
          {left.map((t) => (
            <TabButton key={t.id} t={t} active={tab === t.id} onClick={() => onTab(t.id)} />
          ))}
        </div>
        <div className="flex h-[60px] shrink-0 justify-center">
          <Button
            onClick={onAdd}
            aria-label="Add evidence or case information"
            size="icon"
            className="-mt-7 size-16 rounded-full border-4 border-card shadow-[0_8px_20px_color-mix(in_oklab,var(--primary)_35%,transparent)] transition-transform active:scale-90"
          >
            <Plus className="size-7 stroke-[2.5]" />
          </Button>
        </div>
        <div className="grid min-w-0 grid-cols-3 items-end">
          {right.map((t) => (
            <TabButton key={t.id} t={t} active={tab === t.id} onClick={() => onTab(t.id)} />
          ))}
        </div>
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
      aria-label={t.label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative h-[60px] min-w-0 flex-col gap-0.5 rounded-lg px-0 text-[10px] font-extrabold transition-colors",
        active ? "text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <span
        className={cn(
          "grid h-8 w-11 place-items-center rounded-lg transition-colors group-active:bg-muted",
          active && "bg-accent",
        )}
      >
        <Icon className={cn("size-5", active && "stroke-[2.5]")} />
      </span>
      <span className="max-w-full truncate px-0.5">{t.label}</span>
      <span
        aria-hidden="true"
        className={cn(
          "absolute bottom-0 h-0.5 w-5 rounded-full bg-primary transition-opacity",
          active ? "opacity-100" : "opacity-0",
        )}
      />
    </Button>
  );
}

export { tabs as mainTabs };
