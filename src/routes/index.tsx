import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Bell, ChevronDown, Plus, Search, ShieldCheck } from "lucide-react";

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
import { FileBoardView } from "@/components/evidence/FileBoardView";

import { InspectorDrawer } from "@/components/evidence/InspectorDrawer";
import { KanbanBoard } from "@/components/evidence/KanbanBoard";
import { ProfileGate } from "@/components/evidence/ProfileGate";
import { AddSheet, EventDialog, ExpenseDialog, TaskDialog } from "@/components/evidence/QuickAdd";
import { TimelineView } from "@/components/evidence/TimelineView";
import { TaskReminderManager } from "@/components/evidence/TaskReminderManager";
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
  const { loading, profile, setProfile, caseSettings, stats, syncDrive, scanAllDocuments } = useEvidence();
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

  async function handleDriveSync() {
    try {
      const result = await syncDrive();
      const changed = result.added + result.updated + result.removed;
      const description = changed
        ? `${result.added} added · ${result.updated} renamed or moved · ${result.removed} removed`
        : `${result.folders} folders and ${result.files} original files already match`;
      const { toast } = await import("sonner");
      toast.success("Drive synched successfully", { description });
      const scan = await scanAllDocuments();
      if (scan.total) {
        toast.success(`Scanned ${scan.scanned} document(s)`, {
          description: `${scan.cloned} detailed clone(s) built${scan.failed ? ` · ${scan.failed} could not be read` : ""}`,
        });
      }
    } catch (error) {
      const { toast } = await import("sonner");
      toast.error("Drive sync failed", { description: error instanceof Error ? error.message : "Please try again." });
    }
  }

  return (
    <div className="case-shell min-h-screen bg-background pb-24 lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:pb-0">
      <aside className="case-sidebar fixed inset-y-0 left-0 z-40 hidden w-[240px] flex-col lg:flex">
        <div className="case-brand"><img src="/favicon.png" alt="" /><div><strong>GC</strong><small>Evidence portal</small></div></div>
        <nav className="mt-5 flex w-full flex-col gap-1 px-3" aria-label="Primary navigation">
          {mainTabs.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <Button
                key={item.id}
                variant="ghost"
                onClick={() => setTab(item.id)}
                aria-current={active ? "page" : undefined}
                className={`case-side-link h-11 w-full justify-start gap-3 px-4 text-sm font-bold ${
                  active
                    ? "case-side-link-active"
                    : "text-white/60 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon className="size-5" />
                {item.label}
              </Button>
            );
          })}
        </nav>
        <div className="case-sidebar-status"><ShieldCheck /><div><strong>Private case</strong><span>Imran &amp; Aciah</span></div></div>
      </aside>

      <div className="min-w-0 lg:col-start-2">
        <header className="case-topbar sticky top-0 z-30 pt-[env(safe-area-inset-top)]">
          <div className="flex min-h-[68px] items-center gap-3 px-4 py-2 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3 sm:flex-1">
               <img src="/favicon.png" alt="GC" className="size-10 shrink-0 rounded-lg lg:hidden" />
              <div className="min-w-0">
                <h1 className="truncate font-display text-base font-black text-white sm:text-lg">
                  {caseSettings.caseName}
                </h1>
                <p className="mt-0.5 truncate text-[10px] font-bold text-white/50">
                   Private evidence portal
                </p>
              </div>
            </div>

            <div className="ml-auto hidden max-w-sm flex-1 items-center rounded-lg border border-white/10 bg-white/5 px-3 text-white/60 md:flex">
              <Search className="size-4" /><button onClick={() => setAskOpen(true)} className="h-10 flex-1 text-left text-xs">Search evidence, tasks, notes...</button><kbd>⌘K</kbd>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="ghost" size="icon" className="size-10 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" onClick={() => setAskOpen(true)} aria-label="Open reminders" title="Open reminders"><Bell className="size-4" /></Button>
              <Select value={profile} onValueChange={(v) => setProfile(v as Profile)}>
                <SelectTrigger className="h-10 w-[108px] border-white/10 bg-white/5 text-xs font-bold text-white">
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
              <ChevronDown className="hidden size-3 text-white/50" />
            </div>
          </div>
        </header>

         <main className="mx-auto max-w-[1440px] space-y-4 p-3 sm:p-5 lg:p-7">
        {loading ? (
          <p className="py-20 text-center text-sm text-muted-foreground">Loading case…</p>
        ) : (
          <>
            {tab === "home" && (
              <HomeView onNavigate={(t) => setTab(t)} onUpload={() => openUpload()} onAddTask={() => setTaskOpen(true)} onBuildPacket={() => setPacketOpen(true)} onSyncDrive={handleDriveSync} />
            )}

            {tab === "board" && <FileBoardView />}


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
      <TaskReminderManager />
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
