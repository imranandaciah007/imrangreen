import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CircleDot, CloudCog, MessagesSquare, Plus, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BottomNav, mainTabs, type MainTab } from "@/components/evidence/BottomNav";
import { CaseReviewView } from "@/components/evidence/CaseReviewView";
import { PacketBuilder } from "@/components/evidence/PacketBuilder";
import { CategoryPanel } from "@/components/evidence/CategoryPanel";

import { AskEvidenceDialog } from "@/components/evidence/AskEvidence";
import { CommandPalette } from "@/components/evidence/CommandPalette";
import { ConnectDriveDialog } from "@/components/evidence/ConnectDriveDialog";
import { EvidenceTable } from "@/components/evidence/EvidenceTable";
import { ExhibitIndexView } from "@/components/evidence/ExhibitIndexView";
import { FilterToolbar } from "@/components/evidence/FilterToolbar";
import { FinancesView } from "@/components/evidence/FinancesView";
import { HomeView } from "@/components/evidence/HomeView";
import { InspectorDrawer } from "@/components/evidence/InspectorDrawer";
import { KanbanBoard } from "@/components/evidence/KanbanBoard";
import { ProfileGate } from "@/components/evidence/ProfileGate";
import { AddSheet, EventDialog, ExpenseDialog, TaskDialog } from "@/components/evidence/QuickAdd";
import { TimelineView } from "@/components/evidence/TimelineView";
import { UploadDialog } from "@/components/evidence/UploadDialog";
import { EvidenceStoreProvider, useEvidence } from "@/lib/evidence/store";
import { PROFILES, type EvidenceItem, type Profile } from "@/lib/evidence/types";

const title = "I-601 Evidence Portal — Imran & Aciah";
const description =
  "Private hardship evidence portal for a potential I-601 waiver: collect, organise, review and export supporting evidence from your phone.";

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
      <CaseApp />
    </EvidenceStoreProvider>
  ),
});

function CaseApp() {
  const { connection, loading, profile, setProfile, caseSettings, stats } = useEvidence();
  const [tab, setTab] = useState<MainTab>("home");
  const [connectOpen, setConnectOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [packetOpen, setPacketOpen] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<string | undefined>(undefined);
  const [editItem, setEditItem] = useState<EvidenceItem | null>(null);

  function openUpload(category?: string) {
    setEditItem(null);
    setUploadCategory(category);
    setUploadOpen(true);
  }

  function openEdit(item: EvidenceItem) {
    setUploadCategory(undefined);
    setEditItem(item);
    setUploadOpen(true);
  }

  return (
    <div className="min-h-screen bg-background pb-24 lg:pb-0">
      <header className="sticky top-0 z-30 border-b border-navy/40 bg-navy pt-[env(safe-area-inset-top)] text-navy-foreground shadow-sm">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-navy-foreground/20 bg-navy-foreground/10">
            <ShieldCheck className="size-4.5 opacity-90" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold tracking-tight">
              {caseSettings.caseName}
            </h1>
            <p className="mt-0.5 flex items-center gap-1.5 truncate font-mono text-[10px] text-navy-foreground/65">
              <CircleDot
                className={`size-2.5 ${connection?.connected ? "text-success" : "text-destructive"}`}
              />
              {connection?.connected
                ? `Google Drive · ${connection.folderPath}`
                : "Google Drive not connected"}
            </p>
          </div>
          <Select value={profile} onValueChange={(v) => setProfile(v as Profile)}>
            <SelectTrigger className="h-9 w-[104px] border-navy-foreground/25 bg-transparent text-xs text-navy-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROFILES.map((p) => (
                <SelectItem key={p} value={p} className="text-xs">
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="h-9 border-navy-foreground/25 bg-transparent text-xs text-navy-foreground hover:bg-navy-foreground/12 hover:text-navy-foreground"
            onClick={() => setAskOpen(true)}
          >
            <MessagesSquare className="size-3.5" /> Ask
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 border-navy-foreground/25 bg-transparent text-xs text-navy-foreground hover:bg-navy-foreground/12 hover:text-navy-foreground"
            onClick={() => setConnectOpen(true)}
          >
            <CloudCog className="size-3.5" /> Drive
          </Button>
          <Button
            size="sm"
            className="hidden h-9 bg-navy-foreground text-xs font-semibold text-navy hover:bg-navy-foreground/90 lg:inline-flex"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="size-3.5" /> Add
          </Button>
        </div>

        <nav className="mx-auto hidden max-w-[1600px] gap-1 px-4 pb-2 lg:flex">
          {mainTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                tab === t.id
                  ? "bg-navy-foreground text-navy"
                  : "text-navy-foreground/75 hover:bg-navy-foreground/10"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-[1600px] space-y-4 p-3 lg:p-6">
        {loading ? (
          <p className="py-20 text-center text-sm text-muted-foreground">Loading case…</p>
        ) : (
          <>
            {!connection?.connected && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-warning/40 bg-warning/12 px-3 py-2.5 text-xs">
                <span className="font-medium text-foreground">
                  Google Drive is not connected — files added now are held on this device only.
                </span>
                <Button size="sm" className="h-9" onClick={() => setConnectOpen(true)}>
                  Set up Drive
                </Button>
              </div>
            )}

            {tab === "home" && (
              <HomeView onNavigate={(t) => setTab(t)} onBuildPacket={() => setPacketOpen(true)} />
            )}

            {tab === "timeline" && (
              <TimelineView
                onAddEvent={() => setEventOpen(true)}
                onAddTask={() => setTaskOpen(true)}
              />
            )}

            {tab === "finances" && <FinancesView onAddExpense={() => setExpenseOpen(true)} />}

            {tab === "review" && (
              <CaseReviewView
                onAddTask={() => setTaskOpen(true)}
                onBuildPacket={() => setPacketOpen(true)}
              />
            )}


            {tab === "vault" && (
              <div className="space-y-4 lg:grid lg:grid-cols-[320px_1fr] lg:items-start lg:gap-4 lg:space-y-0">
                <CategoryPanel onUploadTo={(c) => openUpload(c)} />
                <div className="space-y-3">
                  <FilterToolbar />
                  <Tabs defaultValue="table">
                    <TabsList>
                      <TabsTrigger value="table" className="text-xs">
                        List
                      </TabsTrigger>
                      <TabsTrigger value="kanban" className="text-xs">
                        Review stages
                      </TabsTrigger>
                      <TabsTrigger value="index" className="text-xs">
                        Exhibit index
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="table" className="mt-3">
                      <EvidenceTable onEdit={openEdit} />
                    </TabsContent>
                    <TabsContent value="kanban" className="mt-3">
                      <KanbanBoard />
                    </TabsContent>
                    <TabsContent value="index" className="mt-3">
                      <ExhibitIndexView />
                    </TabsContent>
                  </Tabs>
                </div>
              </div>
            )}

            <p className="pt-2 text-center font-mono text-[10px] text-muted-foreground">
              {stats.total} exhibits · {stats.totalPages} pages · signed in as {profile}
            </p>
          </>
        )}
      </main>

      <ProfileGate />
      <InspectorDrawer onEdit={openEdit} />
      <CommandPalette onConnectDrive={() => setConnectOpen(true)} />
      <ConnectDriveDialog open={connectOpen} onOpenChange={setConnectOpen} />
      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        initialCategory={uploadCategory}
        editItem={editItem}
      />
      <AddSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        onUpload={() => openUpload()}
        onExpense={() => setExpenseOpen(true)}
        onEvent={() => setEventOpen(true)}
        onTask={() => setTaskOpen(true)}
      />
      <ExpenseDialog open={expenseOpen} onOpenChange={setExpenseOpen} />
      <EventDialog open={eventOpen} onOpenChange={setEventOpen} />
      <PacketBuilder open={packetOpen} onOpenChange={setPacketOpen} />
      <AskEvidenceDialog open={askOpen} onOpenChange={setAskOpen} />
      <TaskDialog open={taskOpen} onOpenChange={setTaskOpen} />
      <BottomNav tab={tab} onTab={setTab} onAdd={() => setAddOpen(true)} />
    </div>
  );
}
