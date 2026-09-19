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
  const Wrap = ({ children }: { children: React.ReactNode }) =>
    Close ? <Close asChild>{children}</Close> : <>{children}</>;

  return (
    <div
      className={cn(
        "sticky top-0 z-30 flex shrink-0 items-center gap-1 border-b border-border bg-background/95 px-2 py-2 backdrop-blur",
        className,
      )}
      aria-label="Page navigation"
    >
      <Wrap>
        <Button type="button" variant="ghost" size="sm" className="h-9 px-2.5" data-overlay-back>
          <ArrowLeft className="size-4" />
          Back
        </Button>
      </Wrap>
      <Wrap>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 px-2.5"
          onClick={() => window.dispatchEvent(new Event(NAVIGATE_HOME_EVENT))}
          data-overlay-home
        >
          <Home className="size-4" />
          Home
        </Button>
      </Wrap>
    </div>
  );
}
