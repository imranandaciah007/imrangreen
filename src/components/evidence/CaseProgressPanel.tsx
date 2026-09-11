import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronRight,
  Download,
  ExternalLink,
  FileSignature,
  FileText,
  Folder,
  FolderOpen,
  Loader2,
  Printer,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  listCloneFiles,
  listCloneFolders,
  type CloneFolderRow,
} from "@/lib/jobs/background.functions";
import { draftExplorerFiling, type ExplorerFiling } from "@/lib/filing-explorer.functions";
import { explorerFilingHtml } from "@/lib/evidence/explorer-filing-html";
import { useEvidence } from "@/lib/evidence/store";

interface FolderNode {
  name: string;
  path: string;
  children: FolderNode[];
  /** Exhibits directly in this folder. */
  own: CloneFolderRow;
  /** Exhibits in this folder and everything beneath it. */
  total: number;
  built: number;
}

const empty = (path: string): CloneFolderRow => ({
  path,
  total: 0,
  built: 0,
  pending: 0,
  duplicates: 0,
  failed: 0,
});

/** Turn the flat folder paths from the clones root into a tree with roll-up counts. */
function buildTree(rows: CloneFolderRow[]): FolderNode[] {
  const nodes = new Map<string, FolderNode>();
  const ensure = (path: string): FolderNode => {
    const existing = nodes.get(path);
    if (existing) return existing;
    const parts = path.split("/");
    const node: FolderNode = {
      name: parts[parts.length - 1] ?? path,
      path,
      children: [],
      own: empty(path),
      total: 0,
      built: 0,
    };
    nodes.set(path, node);
    if (parts.length > 1) {
      const parent = ensure(parts.slice(0, -1).join("/"));
      parent.children.push(node);
    }
    return node;
  };

  for (const row of rows) {
    if (!row.path) continue;
    ensure(row.path).own = row;
  }
  for (const row of rows) {
    if (!row.path) continue;
    const parts = row.path.split("/");
    for (let i = 1; i <= parts.length; i += 1) {
      const node = nodes.get(parts.slice(0, i).join("/"));
      if (!node) continue;
      node.total += row.total;
      node.built += row.built;
    }
  }

  const sort = (list: FolderNode[]): FolderNode[] => {
    list.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    list.forEach((node) => sort(node.children));
    return list;
  };
  return sort([...nodes.values()].filter((node) => !node.path.includes("/")));
}

function FolderRow({
  node,
  index,
  onOpen,
  selected,
  onToggle,
}: {
  node: FolderNode;
  index: number;
  onOpen: (node: FolderNode) => void;
  /** When provided, the row shows an include/exclude tick for the filing. */
  selected?: boolean;
  onToggle?: (next: boolean) => void;
}) {
  const percent = node.total ? Math.round((node.built / node.total) * 100) : 0;
  return (
    <div className={`flex items-center gap-2 ${onToggle && !selected ? "opacity-55" : ""}`}>
      {onToggle ? (
        <Checkbox
          checked={selected ?? true}
          onCheckedChange={(value) => onToggle(value === true)}
          aria-label={`Include ${node.name} in the filing`}
          className="size-5 shrink-0"
        />
      ) : null}
      <button
        type="button"
        className="case-coverage-row w-full min-w-0 flex-1 text-left"
        onClick={() => onOpen(node)}
      >
        <div className={`case-coverage-icon case-tone-${index % 4}`}>
          <Folder />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex justify-between gap-3 text-xs font-extrabold text-navy">
            <span className="truncate">{node.name}</span>
            <span className="shrink-0">
              {node.built} / {node.total}
            </span>
          </div>
          <Progress value={percent} className="mt-2 h-2.5 bg-slate-100" />
          <p className="mt-1 truncate text-[10px] font-semibold text-navy/50">
            {node.children.length
              ? `${node.children.length} subfolder${node.children.length === 1 ? "" : "s"}`
              : "No subfolders"}
            {node.total - node.built ? ` · ${node.total - node.built} still to prepare` : " · complete"}
          </p>
        </div>
        <ChevronRight className="size-4 shrink-0 text-navy/40" />
      </button>
    </div>
  );
}

/** Every exhibit filed in one folder: the original PDF, plus its enriched clone. */
function FolderFiles({ path }: { path: string }) {
  const fetchFiles = useServerFn(listCloneFiles);
  const { data, isLoading } = useQuery({
    queryKey: ["gc-clone-files", path],
    queryFn: () => fetchFiles({ data: { path } }),
  });

  if (isLoading) {
    return (
      <div className="case-empty">
        <Loader2 className="animate-spin" /> Reading this folder…
      </div>
    );
  }
  if (!data?.files.length) {
    return (
      <div className="case-empty">
        <FileText /> No documents recorded in this folder yet.
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {data.files.map((file) => (
        <div key={file.driveFileId} className="rounded-lg border border-border bg-card p-2.5">
          <div className="flex items-start gap-2">
            <FileText className="mt-0.5 size-3.5 shrink-0 text-navy/50" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-bold text-navy">{file.exhibitTitle}</p>
              <p className="truncate font-mono text-[10px] text-navy/50">
                {file.fileName}
                {file.documentDate ? ` · ${file.documentDate}` : ""}
                {file.pageCount ? ` · ${file.pageCount} page(s)` : ""}
              </p>
              {file.summary ? (
                <p className="mt-1 line-clamp-2 text-[10px] text-navy/60">{file.summary}</p>
              ) : null}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <a
              className="case-view-link inline-flex items-center gap-1 text-[10px]"
              href={file.originalLink}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink className="size-3" /> Original PDF
            </a>
            {file.cloneLink ? (
              <a
                className="case-view-link inline-flex items-center gap-1 text-[10px]"
                href={file.cloneLink}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink className="size-3" /> Exhibit clone
              </a>
            ) : (
              <span className="text-[10px] font-semibold text-navy/45">
                {file.status === "error" ? "Could not be read" : "Clone still to build"}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Case progress, shown two ways: the folders that exist inside the clones root
 * in Drive, and the hardship categories. A third tab browses the mirror itself.
 */
export function CaseProgressPanel({
  onOpenCategory,
  onOpenBoard,
}: {
  onOpenCategory: (category: string) => void;
  onOpenBoard: () => void;
}) {
  const { stats } = useEvidence();
  const fetchFolders = useServerFn(listCloneFolders);
  const { data, isLoading } = useQuery({
    queryKey: ["gc-clone-folders"],
    queryFn: () => fetchFolders(),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  const [path, setPath] = useState<string[]>([]);

  const tree = useMemo(() => buildTree(data?.folders ?? []), [data]);
  const rootRow = (data?.folders ?? []).find((row) => !row.path) ?? empty("");

  const current = useMemo(() => {
    let list = tree;
    let node: FolderNode | null = null;
    for (const part of path) {
      node = list.find((child) => child.name === part) ?? null;
      if (!node) break;
      list = node.children;
    }
    return { list, node };
  }, [tree, path]);

  const totals = tree.reduce(
    (acc, node) => ({ total: acc.total + node.total, built: acc.built + node.built }),
    { total: rootRow.total, built: rootRow.built },
  );
  const overall = totals.total ? Math.round((totals.built / totals.total) * 100) : 0;

  return (
    <section className="case-panel">
      <div className="case-panel-heading">
        <div>
          <span className="case-kicker">CASE PROGRESS</span>
          <h3>{data?.root ?? "I601 Evidence Clones"}</h3>
        </div>
        <Button variant="ghost" onClick={onOpenBoard}>
          Open board <ChevronRight />
        </Button>
      </div>

      <Tabs defaultValue="folders">
        <TabsList className="w-full">
          <TabsTrigger value="folders" className="flex-1 text-[11px]">
            Folders
          </TabsTrigger>
          <TabsTrigger value="categories" className="flex-1 text-[11px]">
            Categories
          </TabsTrigger>
          <TabsTrigger value="explorer" className="flex-1 text-[11px]">
            File explorer
          </TabsTrigger>
        </TabsList>

        <TabsContent value="folders" className="mt-3">
          {isLoading ? (
            <div className="case-empty">
              <Loader2 className="animate-spin" /> Checking the clones folder…
            </div>
          ) : tree.length ? (
            <>
              <div className="mb-3 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-[11px] font-semibold text-navy/70">
                {totals.built} of {totals.total} exhibits prepared across {tree.length} folder
                {tree.length === 1 ? "" : "s"} ({overall}%)
              </div>
              <div className="case-coverage-list">
                {tree.slice(0, 8).map((node, index) => (
                  <FolderRow
                    key={node.path}
                    node={node}
                    index={index}
                    onOpen={() => setPath([node.name])}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="case-empty">
              <Folder /> No folders yet — press Synch now to mirror your Drive.
            </div>
          )}
        </TabsContent>

        <TabsContent value="categories" className="mt-3">
          <div className="case-coverage-list">
            {stats.byCategory.slice(0, 8).map((row, index) => (
              <button
                type="button"
                className="case-coverage-row w-full text-left"
                key={row.category}
                onClick={() => onOpenCategory(row.category)}
              >
                <div className={`case-coverage-icon case-tone-${index % 4}`}>
                  <FileText />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-3 text-xs font-extrabold text-navy">
                    <span className="truncate">{row.category}</span>
                    <span className="shrink-0">
                      {row.ready} / {row.total}
                    </span>
                  </div>
                  <Progress value={row.total ? row.percent : 0} className="mt-2 h-2.5 bg-slate-100" />
                </div>
                <ChevronRight className="size-4 shrink-0 text-navy/40" />
              </button>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="explorer" className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-1 text-[11px] font-bold text-navy/70">
            <button type="button" className="case-view-link" onClick={() => setPath([])}>
              {data?.root ?? "I601 Evidence Clones"}
            </button>
            {path.map((part, index) => (
              <span key={part + index} className="flex items-center gap-1">
                <ChevronRight className="size-3 text-navy/40" />
                <button
                  type="button"
                  className="case-view-link"
                  onClick={() => setPath(path.slice(0, index + 1))}
                >
                  {part}
                </button>
              </span>
            ))}
          </div>

          {isLoading ? (
            <div className="case-empty">
              <Loader2 className="animate-spin" /> Reading the mirror…
            </div>
          ) : (
            <>
              {current.list.length ? (
                <div className="case-coverage-list">
                  {current.list.map((node, index) => (
                    <FolderRow
                      key={node.path}
                      node={node}
                      index={index}
                      onOpen={() => setPath([...path, node.name])}
                    />
                  ))}
                </div>
              ) : (
                <div className="case-empty">
                  <FolderOpen /> No subfolders here.
                </div>
              )}
              <FolderFiles path={path.join("/")} />
            </>
          )}

          <Button variant="outline" className="w-full" onClick={onOpenBoard}>
            <FolderOpen /> Open the full file board
          </Button>
        </TabsContent>
      </Tabs>
    </section>
  );
}
