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
import { DiaryImportDialog } from "@/components/evidence/DiaryImportDialog";
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
  const [diaryOpen, setDiaryOpen] = useState(false);
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
    <div className="min-h-screen bg-background pb-24 lg:grid lg:grid-cols-[88px_minmax(0,1fr)] lg:pb-0">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[88px] flex-col items-center border-r border-sidebar-border bg-sidebar px-2 py-5 lg:flex">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary font-display text-lg font-extrabold text-primary-foreground shadow-panel">
          GC
        </div>
        <nav className="mt-7 flex w-full flex-col gap-2" aria-label="Primary navigation">
          {mainTabs.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <Button
                key={item.id}
                variant="ghost"
                onClick={() => setTab(item.id)}
                aria-current={active ? "page" : undefined}
                className={`h-14 w-full flex-col gap-1 px-1 text-[10px] font-bold ${
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                }`}
              >
                <Icon className="size-5" />
                {item.label}
              </Button>
            );
          })}
        </nav>
        <Button
          size="icon"
          className="mt-auto size-12 rounded-xl shadow-panel"
          onClick={() => setAddOpen(true)}
          aria-label="Add to case"
          title="Add to case"
        >
          <Plus className="size-5" />
        </Button>
      </aside>

      <div className="min-w-0 lg:col-start-2">
        <header className="sticky top-0 z-30 border-b border-border bg-card/95 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
          <div className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 sm:flex sm:px-5 lg:min-h-20 lg:px-8">
            <div className="flex min-w-0 items-center gap-3 sm:flex-1">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary font-display text-sm font-extrabold text-primary-foreground lg:hidden">
                GC
              </span>
              <div className="min-w-0">
                <h1 className="truncate font-display text-base font-extrabold text-foreground sm:text-lg">
                  {caseSettings.caseName}
                </h1>
                <p className="mt-0.5 flex items-center gap-1.5 truncate text-[10px] font-bold text-muted-foreground">
                  <CircleDot
                    className={`size-2.5 shrink-0 ${connection?.connected ? "text-success" : "text-destructive"}`}
                  />
                  {connection?.connected ? "Drive connected" : "Drive disconnected"}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <Button
                variant="outline"
                size="icon"
                className="size-10"
                onClick={() => setAskOpen(true)}
                aria-label="Ask my evidence"
                title="Ask my evidence"
              >
                <MessagesSquare className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="hidden size-10 sm:inline-flex"
                onClick={() => setConnectOpen(true)}
                aria-label="Google Drive"
                title="Google Drive"
              >
                <CloudCog className="size-4" />
              </Button>
              <Select value={profile} onValueChange={(v) => setProfile(v as Profile)}>
                <SelectTrigger className="h-10 w-[92px] text-xs font-bold sm:w-[108px]">
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
              <Button className="hidden h-10 sm:inline-flex" onClick={() => setAddOpen(true)}>
                <Plus className="size-4" /> Add
              </Button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1480px] space-y-4 p-3 sm:p-5 lg:p-8">
        {loading ? (
          <p className="py-20 text-center text-sm text-muted-foreground">Loading case…</p>
        ) : (
          <>
            {!connection?.connected && (
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
                <span className="min-w-0 font-semibold text-foreground">
                  Google Drive is not connected — files added now are held on this device only.
                </span>
                <Button size="sm" className="h-9 shrink-0" onClick={() => setConnectOpen(true)}>
                  Connect
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

            <p className="pt-2 text-center text-[10px] font-semibold text-muted-foreground">
              {stats.total} exhibits · {stats.totalPages} pages · signed in as {profile}
            </p>
          </>
        )}
        </main>
      </div>

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
        onDiary={() => setDiaryOpen(true)}
      />
      <DiaryImportDialog open={diaryOpen} onOpenChange={setDiaryOpen} />
      <ExpenseDialog open={expenseOpen} onOpenChange={setExpenseOpen} />
      <EventDialog open={eventOpen} onOpenChange={setEventOpen} />
      <PacketBuilder open={packetOpen} onOpenChange={setPacketOpen} />
      <AskEvidenceDialog open={askOpen} onOpenChange={setAskOpen} />
      <TaskDialog open={taskOpen} onOpenChange={setTaskOpen} />
      <BottomNav tab={tab} onTab={setTab} onAdd={() => setAddOpen(true)} />
    </div>
  );
}
