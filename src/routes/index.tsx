import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CircleDot, CloudCog, Command, Plus, Scale } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CommandPalette } from "@/components/evidence/CommandPalette";
import { ConnectDriveDialog } from "@/components/evidence/ConnectDriveDialog";
import { EvidenceTable } from "@/components/evidence/EvidenceTable";
import { ExhibitIndexView } from "@/components/evidence/ExhibitIndexView";
import { FilterToolbar } from "@/components/evidence/FilterToolbar";
import { KanbanBoard } from "@/components/evidence/KanbanBoard";
import { KpiBar } from "@/components/evidence/KpiBar";
import { InspectorDrawer } from "@/components/evidence/InspectorDrawer";
import { UploadDialog } from "@/components/evidence/UploadDialog";
import { EvidenceStoreProvider, useEvidence } from "@/lib/evidence/store";

const title = "Exhibit Vault — Green Card Evidence Command Center";
const description =
  "Index, audit, and stage 300+ supporting evidence documents for a US Green Card petition, with exhibit numbering, translation tracking, and a USCIS table of exhibits.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <EvidenceStoreProvider>
      <Dashboard />
    </EvidenceStoreProvider>
  ),
});

function Dashboard() {
  const { connection, loading } = useEvidence();
  const [connectOpen, setConnectOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-navy/40 bg-navy text-navy-foreground">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-2.5">
          <Scale className="size-5 opacity-80" />
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold tracking-tight">Exhibit Vault</h1>
            <p className="truncate font-mono text-[10px] text-navy-foreground/65">
              {connection?.connected
                ? `${connection.providerName} · ${connection.folderPath}`
                : "No storage connected"}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-8 border-navy-foreground/25 bg-transparent text-xs text-navy-foreground hover:bg-navy-foreground/12 hover:text-navy-foreground"
              onClick={() => setConnectOpen(true)}
            >
              <CloudCog className="size-3.5" /> Drive connection
            </Button>
            <span className="hidden items-center gap-1 rounded-md border border-navy-foreground/25 px-2 py-1.5 font-mono text-[10px] text-navy-foreground/75 sm:inline-flex">
              <Command className="size-3" />K search
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] space-y-4 p-4">
        {loading ? (
          <p className="py-20 text-center text-sm text-muted-foreground">Loading evidence index…</p>
        ) : (
          <>
            <KpiBar />
            <FilterToolbar />
            <Tabs defaultValue="table">
              <TabsList>
                <TabsTrigger value="table" className="text-xs">
                  Table
                </TabsTrigger>
                <TabsTrigger value="kanban" className="text-xs">
                  Stage board
                </TabsTrigger>
                <TabsTrigger value="index" className="text-xs">
                  Exhibit index
                </TabsTrigger>
              </TabsList>
              <TabsContent value="table" className="mt-3">
                <EvidenceTable />
              </TabsContent>
              <TabsContent value="kanban" className="mt-3">
                <KanbanBoard />
              </TabsContent>
              <TabsContent value="index" className="mt-3">
                <ExhibitIndexView />
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>

      <InspectorDrawer />
      <CommandPalette onConnectDrive={() => setConnectOpen(true)} />
      <ConnectDriveDialog open={connectOpen} onOpenChange={setConnectOpen} />
    </div>
  );
}
