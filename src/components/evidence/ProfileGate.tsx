import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEvidence } from "@/lib/evidence/store";
import { PROFILES } from "@/lib/evidence/types";

/** First-run profile picker. Remembers the choice on this device. */
export function ProfileGate() {
  const { profileChosen, setProfile, loading, caseSettings } = useEvidence();

  return (
    <Dialog open={!loading && !profileChosen}>
      <DialogContent
        showCloseButton={false}
        className="max-w-sm rounded-2xl [&>button]:hidden"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-base">Who is using the app?</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          {caseSettings.caseName}. Your choice is remembered on this device and recorded against
          everything you add or edit.
        </p>
        <div className="mt-2 grid gap-2">
          {PROFILES.map((p) => (
            <Button
              key={p}
              size="lg"
              variant={p === "Aciah" ? "default" : "outline"}
              className="h-14 justify-start text-base"
              onClick={() => setProfile(p)}
            >
              <span className="mr-3 flex size-8 items-center justify-center rounded-full bg-navy text-sm font-semibold text-navy-foreground">
                {p[0]}
              </span>
              {p}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
