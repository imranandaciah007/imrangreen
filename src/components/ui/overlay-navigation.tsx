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

  // One slim row so pop-ups keep their space for content on a phone.
  const backButton = (
    <Button
      type="button"
      variant="ghost"
      className="h-10 touch-manipulation justify-start gap-1.5 px-2.5 text-sm font-semibold"
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
      className="h-10 touch-manipulation gap-1.5 px-2.5 text-sm font-semibold"
      onClick={handleHome}
      aria-label="Go to Home"
      data-overlay-home
    >
      <Home className="size-5 shrink-0" />
      <span className="sr-only sm:not-sr-only">Home</span>
    </Button>
  );

  return (
    <div
      className={cn(
        "sticky top-0 z-40 flex shrink-0 items-center justify-between border-b border-border bg-background/95 px-1.5 pb-1 pt-[calc(env(safe-area-inset-top)+0.25rem)] backdrop-blur",
        className,
      )}
      aria-label="Page navigation"
    >
      {Close ? <Close asChild>{backButton}</Close> : backButton}
      {Close ? <Close asChild>{homeButton}</Close> : homeButton}
    </div>
  );
}
