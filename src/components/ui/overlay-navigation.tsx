import * as React from "react";
import { ArrowLeft, Home } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const NAVIGATE_HOME_EVENT = "gc:navigate-home";

type CloseWrapper = React.ComponentType<{ asChild?: boolean; children: React.ReactNode }>;

export function OverlayNavigation({
  className,
  Close,
}: {
  className?: string;
  Close?: CloseWrapper;
}) {
  const handleHome = () => {
    window.dispatchEvent(new Event(NAVIGATE_HOME_EVENT));
  };

  const backButton = (
    <Button
      type="button"
      variant="ghost"
      className="h-12 w-full touch-manipulation justify-center gap-2 px-4 text-sm font-bold"
      data-overlay-back
    >
      <ArrowLeft className="size-5 shrink-0" />
      Back
    </Button>
  );

  const homeButton = (
    <Button
      type="button"
      variant="ghost"
      className="h-12 w-full touch-manipulation justify-center gap-2 px-4 text-sm font-bold"
      onClick={handleHome}
      data-overlay-home
    >
      <Home className="size-5 shrink-0" />
      Home
    </Button>
  );

  return (
    <div
      className={cn(
        "sticky top-0 z-40 grid shrink-0 grid-cols-2 gap-2 border-b border-border bg-background/95 px-3 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] shadow-sm backdrop-blur",
        className,
      )}
      aria-label="Page navigation"
    >
      {Close ? <Close asChild>{backButton}</Close> : backButton}
      {Close ? <Close asChild>{homeButton}</Close> : homeButton}
    </div>
  );
}
