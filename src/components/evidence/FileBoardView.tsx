import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  FilePlus2,
  FileText,
  Folder,
  FolderPlus,
  GripVertical,
  Loader2,
  MoveLeft,
  MoveRight,
  RefreshCw,
  Sparkles,
  Star,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useEvidence } from "@/lib/evidence/store";
import {
  createDriveFolder,
  generateCloneDocument,
  listDriveTree,
  uploadEvidenceToFolder,
  type DriveFileNode,
  type DriveFolderNode,
} from "@/lib/drive-tree.functions";
import { cn } from "@/lib/utils";

interface DriveTree {
  folders: DriveFolderNode[];
  files: DriveFileNode[];
  syncedAt: string;
}

const TREE_KEY = "gc.driveTree";
const FAV_KEY = "gc.board.favourites";
const RECENT_KEY = "gc.board.recent";
const ORDER_KEY = "gc.board.order";
const PAGE = 24;

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full — ordering is cosmetic */
  }
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The file could not be read."));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

function exhibitFor(fileId: string) {
  return `EX-${fileId.replace(/[^A-Za-z0-9]/g, "").slice(-4).toUpperCase()}`;
}

/** Plain-language summary of what moved, was renamed, added or removed in Drive. */
function countChanges(before: DriveTree | null, after: DriveTree): string | null {
  if (!before) return null;
  const prev = new Map(
    [...before.folders, ...before.files].map((n) => [n.id, { name: n.name, path: n.path }]),
  );
  const now = [...after.folders, ...after.files];
  let added = 0;
  let renamed = 0;
  let moved = 0;
  for (const node of now) {
    const old = prev.get(node.id);
    if (!old) {
      added += 1;
      continue;
    }
    if (old.name !== node.name) renamed += 1;
    else if (old.path !== node.path) moved += 1;
    prev.delete(node.id);
  }
  const removed = prev.size;
  const parts = [
    added ? `${added} new` : "",
    renamed ? `${renamed} renamed` : "",
    moved ? `${moved} moved` : "",
    removed ? `${removed} no longer in Drive` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

export function FileBoardView() {
  const { items, profile, connection } = useEvidence();
  const [tree, setTree] = useState<DriveTree | null>(() => readJson<DriveTree | null>(TREE_KEY, null));
  const [syncing, setSyncing] = useState(false);
  const [autoSyncing, setAutoSyncing] = useState(false);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [favourites, setFavourites] = useState<string[]>(() => readJson<string[]>(FAV_KEY, []));
  const [recent, setRecent] = useState<string[]>(() => readJson<string[]>(RECENT_KEY, []));
  const [order, setOrder] = useState<Record<string, string[]>>(() =>
    readJson<Record<string, string[]>>(ORDER_KEY, {}),
  );
  const [open, setOpen] = useState({ favourites: true, recent: true, all: true });
  const [visible, setVisible] = useState(PAGE);
  const [newFolder, setNewFolder] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const sentinel = useRef<HTMLDivElement | null>(null);

  const treeRef = useRef<DriveTree | null>(tree);
  treeRef.current = tree;
  const inFlight = useRef(false);

  const sync = useCallback(async (mode: "manual" | "auto" = "manual") => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (mode === "manual") setSyncing(true);
    else setAutoSyncing(true);
    try {
      const next = (await listDriveTree()) as DriveTree;
      const before = treeRef.current;
      const changes = countChanges(before, next);
      setTree(next);
      writeJson(TREE_KEY, next);
      if (mode === "manual") {
        toast.success(`Drive synched — ${next.folders.length} folders, ${next.files.length} files`);
      } else if (changes) {
        toast.success("Your Drive changed — the board has been updated", {
          description: changes,
        });
      }
    } catch (error) {
      if (mode === "manual") {
        toast.error(error instanceof Error ? error.message : "Drive sync failed.");
      }
    } finally {
      inFlight.current = false;
      setSyncing(false);
      setAutoSyncing(false);
    }
  }, []);

  // Always mirror Drive: refresh on open, when the app comes back to the
  // foreground, and quietly every couple of minutes while it stays open.
  useEffect(() => {
    void sync(tree ? "auto" : "manual");
    const onFocus = () => {
      if (document.visibilityState === "visible") void sync("auto");
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    const timer = window.setInterval(() => void sync("auto"), 120_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sync]);

  const folderById = useMemo(
    () => new Map((tree?.folders ?? []).map((f) => [f.id, f])),
    [tree],
  );

  // If the folder you are standing in was deleted or moved out of Drive, go home.
  useEffect(() => {
    if (tree && folderId && !folderById.has(folderId)) setFolderId(null);
  }, [tree, folderId, folderById]);


  const childFolders = useMemo(
    () => (tree?.folders ?? []).filter((f) => f.parentId === folderId),
    [tree, folderId],
  );
  const childFiles = useMemo(
    () => (tree?.files ?? []).filter((f) => f.parentId === folderId),
    [tree, folderId],
  );

  const orderKey = folderId ?? "root";
  const orderedFolders = useMemo(() => {
    const saved = order[orderKey] ?? [];
    const rank = new Map(saved.map((id, index) => [id, index]));
    return [...childFolders].sort(
      (a, b) =>
        (rank.get(a.id) ?? 9e9) - (rank.get(b.id) ?? 9e9) || a.name.localeCompare(b.name),
    );
  }, [childFolders, order, orderKey]);

  useEffect(() => {
    setVisible(PAGE);
  }, [folderId]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setVisible((v) => v + PAGE);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [folderId, tree]);

  const trail = useMemo(() => {
    const parts: DriveFolderNode[] = [];
    let cursor = folderId;
    for (let i = 0; cursor && i < 25; i += 1) {
      const node = folderById.get(cursor);
      if (!node) break;
      parts.unshift(node);
      cursor = node.parentId;
    }
    return parts;
  }, [folderId, folderById]);

  const currentPath = trail.map((t) => t.name).join("/");
  const byDriveId = useMemo(
    () => new Map(items.filter((i) => i.driveFileId).map((i) => [i.driveFileId!, i])),
    [items],
  );

  function openFolder(id: string) {
    setFolderId(id);
    setRecent((prev) => {
      const next = [id, ...prev.filter((r) => r !== id)].slice(0, 12);
      writeJson(RECENT_KEY, next);
      return next;
    });
  }

  function toggleFavourite(id: string) {
    setFavourites((prev) => {
      const next = prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id];
      writeJson(FAV_KEY, next);
      return next;
    });
  }

  function reorder(id: string, direction: -1 | 1) {
    const ids = orderedFolders.map((f) => f.id);
    const from = ids.indexOf(id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= ids.length) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]!);
    setOrder((prev) => {
      const next = { ...prev, [orderKey]: ids };
      writeJson(ORDER_KEY, next);
      return next;
    });
  }

  function dropOn(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const ids = orderedFolders.map((f) => f.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]!);
    setOrder((prev) => {
      const next = { ...prev, [orderKey]: ids };
      writeJson(ORDER_KEY, next);
      return next;
    });
    setDragId(null);
  }

  async function addFolder() {
    const name = newFolder.trim();
    if (!name) return;
    setBusy("folder");
    try {
      await createDriveFolder({ data: { path: [currentPath, name].filter(Boolean).join("/") } });
      setNewFolder("");
      toast.success(`Folder “${name}” created in Drive`);
      await sync();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The folder could not be created.");
    } finally {
      setBusy(null);
    }
  }

  async function addEvidence(files: FileList | null) {
    if (!files?.length) return;
    setBusy("upload");
    try {
      for (const file of Array.from(files)) {
        await uploadEvidenceToFolder({
          data: {
            folderPath: currentPath,
            name: file.name,
            mimeType: file.type || "application/octet-stream",
            base64: await fileToBase64(file),
          },
        });
      }
      toast.success(`${files.length} file${files.length > 1 ? "s" : ""} added to Drive`);
      await sync();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The upload failed.");
    } finally {
      setBusy(null);
      if (uploadRef.current) uploadRef.current.value = "";
    }
  }

  async function makeClone(file: DriveFileNode) {
    setBusy(file.id);
    const item = byDriveId.get(file.id);
    try {
      const result = await generateCloneDocument({
        data: {
          driveFileId: file.id,
          fileName: file.name,
          folderPath: file.path,
          mimeType: file.mimeType,
          meta: {
            exhibitId: item?.exhibitId || exhibitFor(file.id),
            title: item?.title || file.name.replace(/\.[^.]+$/, ""),
            documentDate: item?.dateOfDocument || file.modifiedTime.slice(0, 10),
            person: item?.people?.[0] || "Aciah",
            categories: item?.categories ?? [],
            people: item?.people ?? [],
            sourceType: item?.sourceType ?? "",
            status: item?.status ?? "",
            summary: item?.notes ?? "",
            tags: item?.tags ?? [],
            affectsAciah: item?.affectsAciah,
            addedBy: profile,
          },
        },
      });
      toast.success(`Clone saved: ${result.name}`, {
        description: `${result.folderPath} · ${result.totalPages} pages`,
        action: result.webViewLink
          ? { label: "Open", onClick: () => window.open(result.webViewLink, "_blank") }
          : undefined,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The clone could not be generated.");
    } finally {
      setBusy(null);
    }
  }

  const favouriteFolders = favourites
    .map((id) => folderById.get(id))
    .filter((f): f is DriveFolderNode => Boolean(f));
  const recentFolders = recent
    .map((id) => folderById.get(id))
    .filter((f): f is DriveFolderNode => Boolean(f))
    .filter((f) => !favourites.includes(f.id));

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-1 pb-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-xl font-bold text-foreground">
            {folderId ? trail.at(-1)?.name : "My Drive"}
          </h2>
          <p className="mt-1 truncate text-xs font-medium text-muted-foreground">
            {autoSyncing
              ? "Checking your Drive for changes…"
              : tree
                ? `${childFolders.length} folders · ${childFiles.length} files · auto-matched with Drive ${
                    tree.syncedAt ? new Date(tree.syncedAt).toLocaleTimeString() : "never"
                  }`
                : "Loading your Drive…"}
          </p>
        </div>
        {folderId && (
          <Button variant="outline" size="sm" onClick={() => setFolderId(trail.at(-2)?.id ?? null)}>
            <ArrowLeft className="size-4" /> Back
          </Button>
        )}
        <Button size="sm" className="h-10" onClick={() => void sync("manual")} disabled={syncing}>
          {syncing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          {syncing ? "Synching" : "Synch now"}
        </Button>

      </header>

      {trail.length > 0 && (
        <nav className="flex flex-wrap items-center gap-1 text-[11px] font-bold text-muted-foreground">
          <button onClick={() => setFolderId(null)} className="hover:text-foreground">
            My Drive
          </button>
          {trail.map((node) => (
            <span key={node.id} className="flex items-center gap-1">
              <ChevronRight className="size-3" />
              <button onClick={() => openFolder(node.id)} className="hover:text-foreground">
                {node.name}
              </button>
            </span>
          ))}
        </nav>
      )}

      {!folderId && favouriteFolders.length > 0 && (
        <Section
          label="Favourites"
          icon={Star}
          count={favouriteFolders.length}
          open={open.favourites}
          onToggle={() => setOpen((o) => ({ ...o, favourites: !o.favourites }))}
        >
          <CardGrid>
            {favouriteFolders.map((f) => (
              <FolderCard
                key={f.id}
                folder={f}
                favourite
                onOpen={() => openFolder(f.id)}
                onFavourite={() => toggleFavourite(f.id)}
              />
            ))}
          </CardGrid>
        </Section>
      )}

      {!folderId && recentFolders.length > 0 && (
        <Section
          label="Recently viewed"
          icon={Clock}
          count={recentFolders.length}
          open={open.recent}
          onToggle={() => setOpen((o) => ({ ...o, recent: !o.recent }))}
        >
          <CardGrid>
            {recentFolders.map((f) => (
              <FolderCard
                key={f.id}
                folder={f}
                favourite={false}
                onOpen={() => openFolder(f.id)}
                onFavourite={() => toggleFavourite(f.id)}
              />
            ))}
          </CardGrid>
        </Section>
      )}

      <Section
        label={folderId ? "Inside this folder" : "View all"}
        icon={Folder}
        count={childFolders.length + childFiles.length}
        open={open.all}
        onToggle={() => setOpen((o) => ({ ...o, all: !o.all }))}
      >
        <div className="flex flex-wrap items-center gap-2 pb-3">
          <Input
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void addFolder()}
            placeholder="New folder name"
            className="h-10 max-w-[220px] text-xs"
          />
          <Button size="sm" className="h-10" onClick={() => void addFolder()} disabled={busy === "folder"}>
            <FolderPlus className="size-4" /> Add folder
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-10"
            onClick={() => uploadRef.current?.click()}
            disabled={busy === "upload"}
          >
            {busy === "upload" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FilePlus2 className="size-4" />
            )}
            Add evidence here
          </Button>
          <input
            ref={uploadRef}
            type="file"
            multiple
            accept="application/pdf,image/*,.doc,.docx"
            className="hidden"
            onChange={(e) => void addEvidence(e.target.files)}
          />
        </div>

        <CardGrid>
          {orderedFolders.slice(0, visible).map((f) => (
            <FolderCard
              key={f.id}
              folder={f}
              favourite={favourites.includes(f.id)}
              draggable
              dragging={dragId === f.id}
              onDragStart={() => setDragId(f.id)}
              onDrop={() => dropOn(f.id)}
              onOpen={() => openFolder(f.id)}
              onFavourite={() => toggleFavourite(f.id)}
              onMoveBack={() => reorder(f.id, -1)}
              onMoveForward={() => reorder(f.id, 1)}
            />
          ))}
          {childFiles.slice(0, Math.max(0, visible - orderedFolders.length)).map((file) => (
            <FileCard
              key={file.id}
              file={file}
              exhibit={byDriveId.get(file.id)?.exhibitId ?? exhibitFor(file.id)}
              busy={busy === file.id}
              onClone={() => void makeClone(file)}
            />
          ))}
        </CardGrid>
        <div ref={sentinel} className="h-8" />
        {!tree && (
          <p className="py-8 text-center text-xs font-semibold text-muted-foreground">
            {connection?.connected ? "Loading your Drive…" : "Synch Drive to load your folders."}
          </p>
        )}
      </Section>
    </section>
  );
}

function Section({
  label,
  icon: Icon,
  count,
  open,
  onToggle,
  children,
}: {
  label: string;
  icon: typeof Folder;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-panel">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-12 w-full items-center gap-2 border-b border-border px-4 text-left"
      >
        <Icon className="size-4 text-primary" />
        <span className="text-xs font-black tracking-wide text-foreground uppercase">{label}</span>
        <span className="font-mono text-[10px] text-muted-foreground">{count}</span>
        <ChevronDown
          className={cn("ml-auto size-4 text-muted-foreground transition-transform", !open && "-rotate-90")}
        />
      </button>
      {open && <div className="p-3 sm:p-4">{children}</div>}
    </section>
  );
}

function CardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-2">{children}</div>
  );
}

function FolderCard({
  folder,
  favourite,
  draggable,
  dragging,
  onOpen,
  onFavourite,
  onMoveBack,
  onMoveForward,
  onDragStart,
  onDrop,
}: {
  folder: DriveFolderNode;
  favourite: boolean;
  draggable?: boolean;
  dragging?: boolean;
  onOpen: () => void;
  onFavourite: () => void;
  onMoveBack?: () => void;
  onMoveForward?: () => void;
  onDragStart?: () => void;
  onDrop?: () => void;
}) {
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={(e) => draggable && e.preventDefault()}
      onDrop={onDrop}
      className={cn(
        "group relative grid min-h-[72px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-border bg-background px-3 py-2.5 transition-colors hover:border-ring hover:bg-accent/40 active:bg-accent",
        dragging && "opacity-50",
      )}
    >
      <button onClick={onOpen} className="grid size-11 place-items-center rounded-md bg-secondary text-primary" aria-label={`Open ${folder.name}`}>
        <Folder className="size-5" />
      </button>
      <button onClick={onOpen} className="min-w-0 text-left">
        <span className="block truncate text-sm font-bold text-foreground">{folder.name}</span>
        <span className="mt-1 block font-mono text-[10px] text-muted-foreground">
          {folder.folderCount} folders · {folder.fileCount} files
        </span>
      </button>
      <div className="flex items-center gap-0.5">
        <Button variant="ghost" size="icon" className="size-9" onClick={onFavourite} aria-label="Favourite">
          <Star className={cn("size-4", favourite ? "fill-primary text-primary" : "text-muted-foreground")} />
        </Button>
        {draggable && <>
            <GripVertical className="size-3.5 cursor-grab text-muted-foreground" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7" aria-label="Rearrange">
                  <ChevronDown className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="text-xs" onSelect={() => onMoveBack?.()}>
                  <MoveLeft className="size-3.5" /> Move earlier
                </DropdownMenuItem>
                <DropdownMenuItem className="text-xs" onSelect={() => onMoveForward?.()}>
                  <MoveRight className="size-3.5" /> Move later
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
        </>}
      </div>
    </div>
  );
}

function FileCard({
  file,
  exhibit,
  busy,
  onClone,
}: {
  file: DriveFileNode;
  exhibit: string;
  busy: boolean;
  onClone: () => void;
}) {
  return (
    <div className="grid min-h-[72px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5 transition-colors hover:border-ring hover:bg-accent/40">
      <span className="grid size-11 place-items-center rounded-md bg-muted text-destructive"><FileText className="size-5" /></span>
      <div className="min-w-0">
        <span className="block truncate text-sm font-bold text-foreground">
          {file.name}
        </span>
        <span className="mt-1 block font-mono text-[10px] text-muted-foreground">
          {exhibit} · {(file.size / 1024 / 1024).toFixed(1)} MB
        </span>
      </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" className="h-9 text-[11px]" onClick={onClone} disabled={busy}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            Clone
          </Button>
          {file.webViewLink && (
            <Button
              size="icon"
              variant="outline"
              className="size-8"
              aria-label="Open in Drive"
              onClick={() => window.open(file.webViewLink, "_blank")}
            >
              <ExternalLink className="size-3.5" />
            </Button>
          )}
      </div>
    </div>
  );
}
