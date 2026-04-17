"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText,
  ImageIcon,
  FileSpreadsheet,
  File,
  Search,
  Download,
  Trash2,
  Upload,
  FolderOpen,
  X,
  Grid3x3,
  List,
  FileType,
  Bot,
  Clock,
  Filter,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { cn, timeAgo } from "@/lib/utils";
import {
  getDocuments,
  getDocumentStats,
  getDocumentUrl,
  deleteDocument,
  uploadDocument,
  formatFileSize,
  type Document,
} from "@/lib/supabase-documents";

const FILE_TYPE_ICONS: Record<string, React.ElementType> = {
  image: ImageIcon,
  pdf: FileText,
  document: FileText,
  spreadsheet: FileSpreadsheet,
  presentation: FileType,
  other: File,
};

// File-type palette mapped to chart-1..5 (§3 AWESOME_DESIGN) + destructive for pdf.
// Badge class (bg + text + border) and a standalone background class are kept
// separate so list/grid views don't have to slice composite strings.
const FILE_TYPE_BADGE: Record<string, string> = {
  image: "bg-chart-5/10 text-chart-5 border-chart-5/20",
  pdf: "bg-destructive/10 text-destructive border-destructive/20",
  document: "bg-chart-1/10 text-chart-1 border-chart-1/20",
  spreadsheet: "bg-chart-2/10 text-chart-2 border-chart-2/20",
  presentation: "bg-chart-4/10 text-chart-4 border-chart-4/20",
  other: "bg-chart-3/10 text-chart-3 border-chart-3/20",
};

const FILE_TYPE_ICON_BG: Record<string, string> = {
  image: "bg-chart-5/10",
  pdf: "bg-destructive/10",
  document: "bg-chart-1/10",
  spreadsheet: "bg-chart-2/10",
  presentation: "bg-chart-4/10",
  other: "bg-chart-3/10",
};

const FILE_TYPE_ICON_COLORS: Record<string, string> = {
  image: "text-chart-5",
  pdf: "text-destructive",
  document: "text-chart-1",
  spreadsheet: "text-chart-2",
  presentation: "text-chart-4",
  other: "text-chart-3",
};

const TYPE_FILTERS = [
  { value: "all", label: "All" },
  { value: "image", label: "Images" },
  { value: "pdf", label: "PDFs" },
  { value: "document", label: "Docs" },
  { value: "spreadsheet", label: "Sheets" },
  { value: "presentation", label: "Slides" },
  { value: "other", label: "Other" },
];

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [agents, setAgents] = useState<string[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDocuments = useCallback(
    async (opts?: { isSearch?: boolean }) => {
      if (opts?.isSearch) setSearching(true);
      else setLoading(true);
      try {
        const [result, statsResult] = await Promise.all([
          getDocuments({
            query: query || undefined,
            fileType: typeFilter,
            agentName: agentFilter,
            limit: 100,
          }),
          !opts?.isSearch ? getDocumentStats() : Promise.resolve(null),
        ]);
        setDocuments(result.documents);
        setTotal(result.total);
        if (statsResult) {
          setStats(statsResult.byType);
          setAgents(statsResult.agents);
        }
      } catch (err) {
        console.error("Failed to load documents:", err);
        toast.error("Failed to load documents");
      } finally {
        setLoading(false);
        setSearching(false);
      }
    },
    [query, typeFilter, agentFilter]
  );

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    loadDocuments({ isSearch: true });
  }

  function clearSearch() {
    setQuery("");
    setTypeFilter("all");
    setAgentFilter("all");
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    let successCount = 0;
    try {
      for (const file of Array.from(files)) {
        try {
          await uploadDocument(file, undefined, undefined, []);
          successCount++;
        } catch (err) {
          console.error(`Failed to upload ${file.name}:`, err);
          toast.error(`Failed to upload ${file.name}`);
        }
      }
      if (successCount > 0) {
        toast.success(
          `Uploaded ${successCount} file${successCount > 1 ? "s" : ""}`
        );
        loadDocuments();
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(doc: Document) {
    setDeleting(doc.id);
    try {
      await deleteDocument(doc);
      toast.success(`Deleted ${doc.filename}`);
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
      setTotal((prev) => prev - 1);
    } catch {
      toast.error(`Failed to delete ${doc.filename}`);
    } finally {
      setDeleting(null);
    }
  }

  function handleDownload(doc: Document) {
    try {
      const url = getDocumentUrl(doc.storage_path);
      if (!url) throw new Error("No URL");
      window.open(url, "_blank");
    } catch {
      toast.error(`Failed to download ${doc.filename}`);
    }
  }

  function isPreviewable(doc: Document): boolean {
    return doc.file_type === "image" || doc.file_type === "pdf";
  }

  const hasFilters =
    query.trim() !== "" || typeFilter !== "all" || agentFilter !== "all";

  return (
    <div className="flex flex-col p-6 max-w-7xl mx-auto">
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur-md -mx-6 px-6 pt-6 -mt-6 pb-4 relative sticky-header mb-6 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 ring-1 ring-amber-500/20">
              <FolderOpen className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Files
              </h1>
              <p className="text-sm text-muted-foreground">
                {total} file{total !== 1 ? "s" : ""} from your agents
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div data-tour="docs-view-toggle" className="flex items-center rounded-lg border border-white/[0.08] bg-card/30 p-0.5">
              <button
                onClick={() => setViewMode("grid")}
                className={cn(
                  "rounded-md p-1.5 transition-colors",
                  viewMode === "grid"
                    ? "bg-primary/12 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Grid3x3 className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={cn(
                  "rounded-md p-1.5 transition-colors",
                  viewMode === "list"
                    ? "bg-primary/12 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
            {/* Upload button */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleUpload}
            />
            <Button
              variant="outline"
              className="gap-2"
              data-tour="docs-upload"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? (
                <>
                  <Upload className="h-4 w-4 animate-pulse" />
                  Uploading...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Upload</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </header>

      {/* Search + Filters */}
      <div className="mb-5 space-y-3 shrink-0">
        <form onSubmit={handleSearch} data-tour="docs-search" className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search files by name or description..."
              className="pl-10"
            />
          </div>
          {hasFilters && (
            <Button type="button" variant="outline" onClick={clearSearch}>
              <X className="h-4 w-4" />
            </Button>
          )}
          <Button
            type="submit"
            disabled={searching}
            variant="outline"
            className="gap-1.5"
          >
            <Filter className="h-3.5 w-3.5" />
            {searching ? "..." : "Search"}
          </Button>
        </form>

        {/* Filter chips */}
        <div className="flex items-center gap-4 flex-wrap">
          {/* Type filters */}
          <div data-tour="docs-filters" className="flex items-center gap-1.5 flex-wrap">
            {TYPE_FILTERS.map((t) => {
              const count = t.value === "all" ? total : stats[t.value] || 0;
              if (t.value !== "all" && count === 0) return null;
              return (
                <button
                  key={t.value}
                  onClick={() => setTypeFilter(t.value)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-medium border transition-all duration-200",
                    typeFilter === t.value
                      ? "bg-primary/12 border-primary/30 text-primary"
                      : "bg-card/30 border-white/[0.06] text-muted-foreground hover:border-primary/20 hover:text-foreground"
                  )}
                >
                  {t.label}
                  {count > 0 && (
                    <span className="ml-1 text-[10px] opacity-60">{count}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Agent filter */}
          {agents.length > 0 && (
            <>
              <div className="h-4 w-px bg-white/[0.08]" />
              <div className="flex items-center gap-1.5 flex-wrap">
                <Bot className="h-3.5 w-3.5 text-muted-foreground/50" />
                <button
                  onClick={() => setAgentFilter("all")}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-medium border transition-all duration-200",
                    agentFilter === "all"
                      ? "bg-primary/12 border-primary/30 text-primary"
                      : "bg-card/30 border-white/[0.06] text-muted-foreground hover:border-primary/20 hover:text-foreground"
                  )}
                >
                  All Agents
                </button>
                {agents.map((agent) => (
                  <button
                    key={agent}
                    onClick={() => setAgentFilter(agent)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-xs font-medium border transition-all duration-200",
                      agentFilter === agent
                        ? "bg-violet-500/15 border-violet-500/30 text-violet-400"
                        : "bg-card/30 border-white/[0.06] text-muted-foreground hover:border-violet-500/20 hover:text-foreground"
                    )}
                  >
                    {agent}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <LoadingSkeleton viewMode={viewMode} />
        ) : documents.length === 0 ? (
          <EmptyState hasFilters={hasFilters} onUpload={() => fileInputRef.current?.click()} />
        ) : viewMode === "grid" ? (
          <div data-tour="docs-grid" className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {documents.map((doc) => (
              <DocumentGridCard
                key={doc.id}
                doc={doc}
                onDownload={handleDownload}
                onDelete={handleDelete}
                deleting={deleting === doc.id}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-1.5">
            {documents.map((doc) => (
              <DocumentListRow
                key={doc.id}
                doc={doc}
                onDownload={handleDownload}
                onDelete={handleDelete}
                deleting={deleting === doc.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DocumentGridCard({
  doc,
  onDownload,
  onDelete,
  deleting,
}: {
  doc: Document;
  onDownload: (d: Document) => void;
  onDelete: (d: Document) => void;
  deleting: boolean;
}) {
  const Icon = FILE_TYPE_ICONS[doc.file_type] || File;
  const iconColor = FILE_TYPE_ICON_COLORS[doc.file_type] || "text-violet-400";
  const isImage = doc.file_type === "image";
  const previewUrl = isImage ? getDocumentUrl(doc.storage_path) : null;

  return (
    <Card className="group relative overflow-hidden">
      {/* Preview / Icon area */}
      <div className="relative h-32 flex items-center justify-center bg-white/[0.02] border-b border-white/[0.04]">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={doc.filename}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <Icon className={cn("h-12 w-12 opacity-30", iconColor)} />
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <button
            onClick={() => onDownload(doc)}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
            title="Download / Open"
          >
            <Download className="h-4 w-4 text-white" />
          </button>
          <button
            onClick={() => onDelete(doc)}
            disabled={deleting}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500/20 hover:bg-red-500/30 transition-colors disabled:opacity-50"
            title="Delete"
          >
            <Trash2 className="h-4 w-4 text-red-400" />
          </button>
        </div>
      </div>

      <CardContent className="pt-3 pb-3">
        <p
          className="text-sm font-medium truncate"
          title={doc.filename}
        >
          {doc.filename}
        </p>
        <div className="flex items-center gap-2 mt-1.5">
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] px-1.5 py-0",
              FILE_TYPE_BADGE[doc.file_type] || FILE_TYPE_BADGE.other
            )}
          >
            {doc.file_type}
          </Badge>
          <span className="text-[10px] text-muted-foreground">
            {formatFileSize(doc.file_size)}
          </span>
        </div>
        <div className="flex items-center justify-between mt-1.5">
          {doc.agent_name && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Bot className="h-3 w-3" />
              {doc.agent_name}
            </span>
          )}
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground ml-auto">
            <Clock className="h-3 w-3" />
            {timeAgo(doc.created_at)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function DocumentListRow({
  doc,
  onDownload,
  onDelete,
  deleting,
}: {
  doc: Document;
  onDownload: (d: Document) => void;
  onDelete: (d: Document) => void;
  deleting: boolean;
}) {
  const Icon = FILE_TYPE_ICONS[doc.file_type] || File;
  const iconColor = FILE_TYPE_ICON_COLORS[doc.file_type] || FILE_TYPE_ICON_COLORS.other;
  const iconBg = FILE_TYPE_ICON_BG[doc.file_type] || FILE_TYPE_ICON_BG.other;

  return (
    <Card size="sm" className="group">
      <CardContent className="flex items-center gap-4 py-2.5 px-4">
        {/* Icon */}
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            iconBg
          )}
        >
          <Icon className={cn("h-4 w-4", iconColor)} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{doc.filename}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] px-1.5 py-0",
                FILE_TYPE_BADGE[doc.file_type] || FILE_TYPE_BADGE.other
              )}
            >
              {doc.file_type}
            </Badge>
            <span className="text-[10px] text-muted-foreground">
              {formatFileSize(doc.file_size)}
            </span>
            {doc.agent_name && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Bot className="h-3 w-3" />
                {doc.agent_name}
              </span>
            )}
          </div>
        </div>

        {/* Meta */}
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
          <Clock className="h-3 w-3" />
          {timeAgo(doc.created_at)}
        </span>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={() => onDownload(doc)}
            className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-white/[0.06] text-muted-foreground hover:text-foreground transition-colors"
            title="Download"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onDelete(doc)}
            disabled={deleting}
            className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors disabled:opacity-50"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton({ viewMode }: { viewMode: "grid" | "list" }) {
  if (viewMode === "grid") {
    return (
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <Card key={i}>
            <div className="h-32 bg-white/[0.02]" />
            <CardContent className="pt-3 pb-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2 mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {Array.from({ length: 8 }).map((_, i) => (
        <Card key={i} size="sm">
          <CardContent className="flex items-center gap-4 py-2.5 px-4">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <div className="flex-1">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-24 mt-1.5" />
            </div>
            <Skeleton className="h-3 w-16" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EmptyState({
  hasFilters,
  onUpload,
}: {
  hasFilters: boolean;
  onUpload: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/5 ring-1 ring-amber-500/10 mb-4">
        <FolderOpen className="h-8 w-8 text-amber-400/30" />
      </div>
      {hasFilters ? (
        <>
          <p className="font-medium">No documents match your filters</p>
          <p className="text-sm text-muted-foreground/60 mt-1 max-w-xs">
            Try adjusting your search or removing filters
          </p>
        </>
      ) : (
        <>
          <p className="font-medium">No files yet</p>
          <p className="text-sm text-muted-foreground/60 mt-1 max-w-xs">
            Files created by agents will appear here automatically. You can
            also upload files manually.
          </p>
          <Button
            variant="outline"
            className="mt-4 gap-2"
            onClick={onUpload}
          >
            <Upload className="h-4 w-4" />
            Upload Files
          </Button>
        </>
      )}
    </div>
  );
}
