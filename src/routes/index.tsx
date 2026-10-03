import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Plus, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { NAVIGATE_HOME_EVENT } from "@/components/ui/overlay-navigation";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppHeader } from "@/components/evidence/AppHeader";
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
import { AddSheet, EventDialog, ExpenseDialog, TaskDialog } from "@/components/evidence/QuickAdd";
import { TimelineView } from "@/components/evidence/TimelineView";
import { TaskReminderManager } from "@/components/evidence/TaskReminderManager";
import { DiaryImportDialog } from "@/components/evidence/DiaryImportDialog";
import { SignInGate } from "@/components/evidence/SignInGate";
import { UploadDialog } from "@/components/evidence/UploadDialog";
import { EvidenceStoreProvider, useEvidence } from "@/lib/evidence/store";
import { type EvidenceItem } from "@/lib/evidence/types";

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
    <SignInGate>
      <EvidenceStoreProvider>
        <CaseApp />
      </EvidenceStoreProvider>
    </SignInGate>
  ),
});

function CaseApp() {
  const { loading, stats, syncDrive, scanAllDocuments, setFilters, openInspector } = useEvidence();
  const [tab, setTabRaw] = useState<MainTab>("home");
  const tabRef = useRef<MainTab>("home");

  // Give every page switch its own browser history entry, so the phone's back
  // button returns to the previous page instead of leaving the app.
  function setTab(next: MainTab) {
    if (next === tabRef.current) return;
    tabRef.current = next;
    setTabRaw(next);
    window.history.pushState({ gcTab: next }, "");
  }

  useEffect(() => {
    window.history.replaceState({ gcTab: "home" }, "");
    const onPop = (event: PopStateEvent) => {
      const target = (event.state?.gcTab as MainTab | undefined) ?? "home";
      tabRef.current = target;
      setTabRaw(target);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
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

  useEffect(() => {
    const goHome = () => {
      setConnectOpen(false);
      setUploadOpen(false);
      setAddOpen(false);
      setExpenseOpen(false);
      setEventOpen(false);
      setTaskOpen(false);
      setAskOpen(false);
      setPacketOpen(false);
      setDiaryOpen(false);
      openInspector(null);
      setTab("home");
    };
    window.addEventListener(NAVIGATE_HOME_EVENT, goHome);
    return () => window.removeEventListener(NAVIGATE_HOME_EVENT, goHome);
  }, [openInspector]);

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

  function openCategory(category: string) {
    setFilters({ categories: [category] });
    setTab("vault");
  }


  async function handleDriveSync() {
    const { toast } = await import("sonner");
    try {
      const result = await syncDrive();
      if (result.skipped) {
        toast.info("A synch is already running", {
          description: "It will finish on its own — no need to press again.",
        });
        return;
      }
      const changed = result.added + result.updated + result.removed + result.duplicates;
      const description = changed
        ? `${result.added} added · ${result.updated} renamed or moved · ${result.removed} removed · ${result.duplicates} duplicate(s) merged`
        : `${result.folders} folders and ${result.files} original files already match`;
      toast.success("Drive synched successfully", { description });
      const scan = await scanAllDocuments();
      if (scan.verified || scan.total) {
        const allFailed = scan.failed > 0 && scan.cloned === 0 && scan.verified === 0;
        const headline = scan.total
          ? `Checked ${scan.total} document(s)`
          : `Verified ${scan.verified} exhibit(s)`;
        const detail = `${scan.verified} already built and verified · ${scan.cloned} newly built${scan.failed ? ` · ${scan.failed} could not be read` : ""}`;
        if (allFailed) {
          toast.error("No documents could be read", { description: detail });
        } else if (scan.failed) {
          toast.warning(headline, { description: detail });
        } else {
          toast.success(headline, { description: detail });
        }
      }
    } catch (error) {
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
        <AppHeader
          tab={tab}
          onSearch={() => setAskOpen(true)}
          onOpenTasks={() => setTab("review")}
          onAddTask={() => setTaskOpen(true)}
          onHome={() => setTab("home")}
          onBack={() => {
            if (window.history.state?.gcTab && window.history.length > 1) window.history.back();
            else setTab("home");
          }}
        />

         <main className="mx-auto max-w-[1440px] space-y-4 p-3 sm:p-5 lg:p-7">
        {loading ? (
          <p className="py-20 text-center text-sm text-muted-foreground">Loading case…</p>
        ) : (
          <>
            {tab === "home" && (
              <HomeView onNavigate={(t) => setTab(t)} onUpload={() => openUpload()} onAddTask={() => setTaskOpen(true)} onBuildPacket={() => setPacketOpen(true)} onSyncDrive={handleDriveSync} onOpenCategory={openCategory} />
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
                onOpenCategory={openCategory}
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
              {stats.total} exhibits · {stats.totalPages} pages
            </p>
          </>
        )}
        </main>
      </div>

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
