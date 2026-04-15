"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Mail,
  HardDrive,
  FileText,
  FileSpreadsheet,
  Search,
  Loader2,
  RefreshCw,
  ExternalLink,
  AlertCircle,
  Inbox,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface GmailMessage {
  id: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  unread: boolean;
}

interface DriveFile {
  id: string;
  name: string;
  mime_type: string;
  modified_time: string;
  url: string;
  owner: string;
  size: number;
}

interface SheetPreview {
  id: string;
  title: string;
  first_sheet: string;
  sheet_tabs: string[];
  preview: unknown[][];
  url: string;
}

interface DocContent {
  id: string;
  name: string;
  modified_time: string;
  url: string;
  content: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function parseFromHeader(from: string): { name: string; email: string } {
  // "Name <email@domain>" or just "email@domain"
  const match = from.match(/^(.*?)\s*<(.+?)>$/);
  if (match) return { name: match[1].replace(/"/g, "").trim(), email: match[2] };
  return { name: from, email: from };
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatWhen(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = diffMs / 1000 / 60 / 60;
  if (diffH < 1) return `${Math.floor(diffMs / 1000 / 60)}m ago`;
  if (diffH < 24) return `${Math.floor(diffH)}h ago`;
  if (diffH < 24 * 7) return `${Math.floor(diffH / 24)}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: diffH > 24 * 365 ? "numeric" : undefined });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function GooglePage() {
  const [needsReconnect, setNeedsReconnect] = useState(false);

  // Gmail
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const [gmailMessages, setGmailMessages] = useState<GmailMessage[]>([]);
  const [gmailLoading, setGmailLoading] = useState(true);
  const [gmailQuery, setGmailQuery] = useState("");
  const [selectedMessage, setSelectedMessage] = useState<{ id: string; from: string; to: string; subject: string; date: string; body: string } | null>(null);
  const [messageLoading, setMessageLoading] = useState(false);

  // Drive
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveQuery, setDriveQuery] = useState("");

  // Docs
  const [docs, setDocs] = useState<DriveFile[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsQuery, setDocsQuery] = useState("");
  const [selectedDoc, setSelectedDoc] = useState<DocContent | null>(null);
  const [docLoading, setDocLoading] = useState(false);

  // Sheets
  const [sheets, setSheets] = useState<DriveFile[]>([]);
  const [sheetsLoading, setSheetsLoading] = useState(false);
  const [sheetsQuery, setSheetsQuery] = useState("");
  const [selectedSheet, setSelectedSheet] = useState<SheetPreview | null>(null);
  const [sheetPreviewLoading, setSheetPreviewLoading] = useState(false);

  // ---------------------------------------------------------------------
  // Generic fetch with reconnect detection
  // ---------------------------------------------------------------------
  const gfetch = useCallback(async <T,>(url: string): Promise<T | null> => {
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) {
        if (data.needs_reconnect) setNeedsReconnect(true);
        return null;
      }
      return data as T;
    } catch {
      return null;
    }
  }, []);

  // ---------------------------------------------------------------------
  // Initial loads
  // ---------------------------------------------------------------------
  const loadGmail = useCallback(async (q: string = "") => {
    setGmailLoading(true);
    const [inbox, unread] = await Promise.all([
      gfetch<{ messages: GmailMessage[] }>(q ? `/api/google?action=gmail-search&q=${encodeURIComponent(q)}&max=25` : "/api/google?action=gmail-inbox&max=25"),
      gfetch<{ count: number }>("/api/google?action=gmail-unread"),
    ]);
    setGmailMessages(inbox?.messages || []);
    if (unread) setUnreadCount(unread.count);
    setGmailLoading(false);
  }, [gfetch]);

  const loadDrive = useCallback(async (q: string = "") => {
    setDriveLoading(true);
    const data = await gfetch<{ files: DriveFile[] }>(`/api/google?action=drive-list${q ? `&q=${encodeURIComponent(q)}` : ""}&max=40`);
    setDriveFiles(data?.files || []);
    setDriveLoading(false);
  }, [gfetch]);

  const loadDocs = useCallback(async (q: string = "") => {
    setDocsLoading(true);
    const data = await gfetch<{ files: DriveFile[] }>(`/api/google?action=docs-list${q ? `&q=${encodeURIComponent(q)}` : ""}&max=40`);
    setDocs(data?.files || []);
    setDocsLoading(false);
  }, [gfetch]);

  const loadSheets = useCallback(async (q: string = "") => {
    setSheetsLoading(true);
    const data = await gfetch<{ files: DriveFile[] }>(`/api/google?action=sheets-list${q ? `&q=${encodeURIComponent(q)}` : ""}&max=40`);
    setSheets(data?.files || []);
    setSheetsLoading(false);
  }, [gfetch]);

  // Load Gmail on mount (default tab)
  useEffect(() => {
    loadGmail();
  }, [loadGmail]);

  // ---------------------------------------------------------------------
  // Message/doc/sheet openers
  // ---------------------------------------------------------------------
  async function openMessage(id: string) {
    setMessageLoading(true);
    setSelectedMessage(null);
    const data = await gfetch<{ id: string; from: string; to: string; subject: string; date: string; body: string }>(
      `/api/google?action=gmail-message&id=${encodeURIComponent(id)}`,
    );
    if (data) setSelectedMessage(data);
    setMessageLoading(false);
  }

  async function openDoc(id: string) {
    setDocLoading(true);
    setSelectedDoc(null);
    const data = await gfetch<DocContent>(`/api/google?action=docs-content&id=${encodeURIComponent(id)}`);
    if (data) setSelectedDoc(data);
    setDocLoading(false);
  }

  async function openSheet(id: string) {
    setSheetPreviewLoading(true);
    setSelectedSheet(null);
    const data = await gfetch<SheetPreview>(`/api/google?action=sheets-preview&id=${encodeURIComponent(id)}`);
    if (data) setSelectedSheet(data);
    setSheetPreviewLoading(false);
  }

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <header className="sticky top-0 z-10 backdrop-blur-md -mx-6 px-6 pt-6 -mt-6 pb-4 relative sticky-header mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/15 ring-1 ring-sky-500/20">
            <HardDrive className="h-5 w-5 text-sky-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Google Workspace</h1>
            <p className="text-sm text-muted-foreground">
              Gmail, Drive, Docs, and Sheets — browse alongside Harv
            </p>
          </div>
        </div>
      </header>

      {/* Reconnect banner */}
      {needsReconnect && (
        <Card className="mb-4 border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-3 flex items-center gap-3">
            <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
            <div className="flex-1 text-xs">
              <p className="font-medium text-amber-400">Google connection expired</p>
              <p className="text-muted-foreground">Reconnect to keep browsing your workspace.</p>
            </div>
            <Link href="/integrations">
              <Button size="sm" variant="outline" className="text-xs">Reconnect</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="gmail" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="gmail">
            <Mail className="h-3.5 w-3.5 mr-1.5" />
            Gmail {unreadCount !== null && unreadCount > 0 && (
              <Badge className="ml-1.5 h-4 px-1 text-[9px]">{unreadCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="drive" onClick={() => { if (driveFiles.length === 0) loadDrive(); }}>
            <HardDrive className="h-3.5 w-3.5 mr-1.5" />
            Drive
          </TabsTrigger>
          <TabsTrigger value="docs" onClick={() => { if (docs.length === 0) loadDocs(); }}>
            <FileText className="h-3.5 w-3.5 mr-1.5" />
            Docs
          </TabsTrigger>
          <TabsTrigger value="sheets" onClick={() => { if (sheets.length === 0) loadSheets(); }}>
            <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />
            Sheets
          </TabsTrigger>
        </TabsList>

        {/* ================================================================ */}
        {/* GMAIL */}
        {/* ================================================================ */}
        <TabsContent value="gmail" className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Search Gmail (e.g., from:notion, is:unread, after:2025/01/01)"
              value={gmailQuery}
              onChange={(e) => setGmailQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadGmail(gmailQuery)}
              className="flex-1"
            />
            <Button variant="outline" size="icon" onClick={() => loadGmail(gmailQuery)} disabled={gmailLoading}>
              {gmailLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => { setGmailQuery(""); loadGmail(""); }} title="Refresh inbox">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
            {/* Message list */}
            <Card className="flex flex-col max-h-[600px]">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Inbox className="h-4 w-4 text-sky-400" />
                  {gmailQuery ? `Search results` : `Inbox`}
                </CardTitle>
                <span className="text-[10px] text-muted-foreground">{gmailMessages.length} messages</span>
              </CardHeader>
              <CardContent className="overflow-y-auto flex-1 p-0">
                {gmailLoading && gmailMessages.length === 0 ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/40" />
                  </div>
                ) : gmailMessages.length === 0 ? (
                  <p className="text-xs text-muted-foreground/50 text-center py-8 px-4">
                    No messages found.
                  </p>
                ) : (
                  <div className="divide-y divide-white/[0.04]">
                    {gmailMessages.map((msg) => {
                      const sender = parseFromHeader(msg.from);
                      const isSelected = selectedMessage?.id === msg.id;
                      return (
                        <button
                          key={msg.id}
                          onClick={() => openMessage(msg.id)}
                          className={cn(
                            "w-full text-left px-4 py-2.5 hover:bg-white/[0.03] transition-colors",
                            isSelected && "bg-white/[0.05]",
                            msg.unread && "border-l-2 border-sky-500/60",
                          )}
                        >
                          <div className="flex items-start justify-between gap-2 mb-0.5">
                            <span className={cn("text-xs truncate", msg.unread ? "font-semibold" : "font-medium text-foreground/70")}>
                              {sender.name || sender.email}
                            </span>
                            <span className="text-[10px] text-muted-foreground shrink-0">{formatWhen(msg.date)}</span>
                          </div>
                          <p className={cn("text-xs truncate", msg.unread ? "text-foreground" : "text-foreground/70")}>
                            {msg.subject || "(no subject)"}
                          </p>
                          <p className="text-[11px] text-muted-foreground/60 truncate mt-0.5">{msg.snippet}</p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Message preview */}
            <Card className="max-h-[600px] flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Preview</CardTitle>
              </CardHeader>
              <CardContent className="overflow-y-auto flex-1">
                {messageLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/40" />
                  </div>
                ) : !selectedMessage ? (
                  <p className="text-xs text-muted-foreground/50 text-center py-12">Select a message to read.</p>
                ) : (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold">{selectedMessage.subject || "(no subject)"}</h3>
                    <div className="text-[11px] text-muted-foreground space-y-0.5">
                      <p><span className="text-muted-foreground/50">From:</span> {selectedMessage.from}</p>
                      {selectedMessage.to && <p><span className="text-muted-foreground/50">To:</span> {selectedMessage.to}</p>}
                      <p><span className="text-muted-foreground/50">Date:</span> {selectedMessage.date}</p>
                    </div>
                    <div className="border-t border-white/[0.06] pt-2 mt-2">
                      <pre className="text-xs text-foreground/80 whitespace-pre-wrap font-sans leading-relaxed">
                        {selectedMessage.body || "(no body)"}
                      </pre>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ================================================================ */}
        {/* DRIVE */}
        {/* ================================================================ */}
        <TabsContent value="drive" className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Search Drive files by name"
              value={driveQuery}
              onChange={(e) => setDriveQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadDrive(driveQuery)}
              className="flex-1"
            />
            <Button variant="outline" size="icon" onClick={() => loadDrive(driveQuery)} disabled={driveLoading}>
              {driveLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
          <FileList files={driveFiles} loading={driveLoading} />
        </TabsContent>

        {/* ================================================================ */}
        {/* DOCS */}
        {/* ================================================================ */}
        <TabsContent value="docs" className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Search Google Docs by name"
              value={docsQuery}
              onChange={(e) => setDocsQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadDocs(docsQuery)}
              className="flex-1"
            />
            <Button variant="outline" size="icon" onClick={() => loadDocs(docsQuery)} disabled={docsLoading}>
              {docsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
            <Card className="flex flex-col max-h-[600px]">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileText className="h-4 w-4 text-blue-400" />
                  Documents
                </CardTitle>
                <span className="text-[10px] text-muted-foreground">{docs.length}</span>
              </CardHeader>
              <CardContent className="overflow-y-auto flex-1 p-0">
                {docsLoading && docs.length === 0 ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/40" />
                  </div>
                ) : docs.length === 0 ? (
                  <p className="text-xs text-muted-foreground/50 text-center py-8 px-4">No documents found.</p>
                ) : (
                  <div className="divide-y divide-white/[0.04]">
                    {docs.map((f) => {
                      const isSelected = selectedDoc?.id === f.id;
                      return (
                        <button
                          key={f.id}
                          onClick={() => openDoc(f.id)}
                          className={cn(
                            "w-full text-left px-4 py-2.5 hover:bg-white/[0.03] transition-colors",
                            isSelected && "bg-white/[0.05]",
                          )}
                        >
                          <p className="text-xs font-medium truncate">{f.name}</p>
                          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                            {formatWhen(f.modified_time)} · {f.owner}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card className="max-h-[600px] flex flex-col">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm">Content</CardTitle>
                {selectedDoc?.url && (
                  <a href={selectedDoc.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline inline-flex items-center gap-1">
                    Open in Docs <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
              </CardHeader>
              <CardContent className="overflow-y-auto flex-1">
                {docLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/40" />
                  </div>
                ) : !selectedDoc ? (
                  <p className="text-xs text-muted-foreground/50 text-center py-12">Select a doc to preview.</p>
                ) : (
                  <div>
                    <h3 className="text-sm font-semibold mb-2">{selectedDoc.name}</h3>
                    <pre className="text-xs text-foreground/80 whitespace-pre-wrap font-sans leading-relaxed">
                      {selectedDoc.content || "(empty)"}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ================================================================ */}
        {/* SHEETS */}
        {/* ================================================================ */}
        <TabsContent value="sheets" className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Search Google Sheets by name"
              value={sheetsQuery}
              onChange={(e) => setSheetsQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadSheets(sheetsQuery)}
              className="flex-1"
            />
            <Button variant="outline" size="icon" onClick={() => loadSheets(sheetsQuery)} disabled={sheetsLoading}>
              {sheetsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_1.6fr]">
            <Card className="flex flex-col max-h-[600px]">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
                  Spreadsheets
                </CardTitle>
                <span className="text-[10px] text-muted-foreground">{sheets.length}</span>
              </CardHeader>
              <CardContent className="overflow-y-auto flex-1 p-0">
                {sheetsLoading && sheets.length === 0 ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/40" />
                  </div>
                ) : sheets.length === 0 ? (
                  <p className="text-xs text-muted-foreground/50 text-center py-8 px-4">No sheets found.</p>
                ) : (
                  <div className="divide-y divide-white/[0.04]">
                    {sheets.map((f) => {
                      const isSelected = selectedSheet?.id === f.id;
                      return (
                        <button
                          key={f.id}
                          onClick={() => openSheet(f.id)}
                          className={cn(
                            "w-full text-left px-4 py-2.5 hover:bg-white/[0.03] transition-colors",
                            isSelected && "bg-white/[0.05]",
                          )}
                        >
                          <p className="text-xs font-medium truncate">{f.name}</p>
                          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                            {formatWhen(f.modified_time)} · {f.owner}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card className="max-h-[600px] flex flex-col">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm">Preview</CardTitle>
                {selectedSheet?.url && (
                  <a href={selectedSheet.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline inline-flex items-center gap-1">
                    Open in Sheets <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
              </CardHeader>
              <CardContent className="overflow-y-auto flex-1">
                {sheetPreviewLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/40" />
                  </div>
                ) : !selectedSheet ? (
                  <p className="text-xs text-muted-foreground/50 text-center py-12">Select a sheet to preview.</p>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold">{selectedSheet.title}</h3>
                      <Badge variant="outline" className="text-[10px]">
                        {selectedSheet.sheet_tabs.length} tab{selectedSheet.sheet_tabs.length !== 1 ? "s" : ""}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground mb-3">
                      First 20 rows of &quot;{selectedSheet.first_sheet}&quot;
                    </p>
                    <div className="overflow-x-auto rounded-lg ring-1 ring-white/[0.06]">
                      <table className="text-[11px] w-full">
                        <tbody>
                          {selectedSheet.preview.map((row, i) => (
                            <tr key={i} className={cn(i === 0 && "bg-white/[0.03] font-semibold")}>
                              {(row as unknown[]).map((cell, j) => (
                                <td key={j} className="px-2 py-1 border-r border-white/[0.04] last:border-r-0 whitespace-nowrap max-w-[180px] truncate">
                                  {String(cell ?? "")}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generic file list (Drive tab)
// ---------------------------------------------------------------------------
function FileList({ files, loading }: { files: DriveFile[]; loading: boolean }) {
  if (loading && files.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/40" />
        </CardContent>
      </Card>
    );
  }
  if (files.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <HardDrive className="h-10 w-10 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground/50">No files found.</p>
        </CardContent>
      </Card>
    );
  }

  const typeLabel = (mime: string): string => {
    if (mime.includes("document")) return "Doc";
    if (mime.includes("spreadsheet")) return "Sheet";
    if (mime.includes("presentation")) return "Slides";
    if (mime.includes("folder")) return "Folder";
    if (mime.includes("image")) return "Image";
    if (mime.includes("pdf")) return "PDF";
    if (mime.includes("video")) return "Video";
    return mime.split("/")[1] || "File";
  };

  return (
    <Card>
      <CardContent className="p-0">
        <div className="divide-y divide-white/[0.04]">
          {files.map((f) => (
            <a
              key={f.id}
              href={f.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03] transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{f.name}</p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                  {formatWhen(f.modified_time)} · {f.owner || "—"} · {formatSize(f.size)}
                </p>
              </div>
              <Badge variant="outline" className="text-[9px] shrink-0">
                {typeLabel(f.mime_type)}
              </Badge>
              <ExternalLink className="h-3 w-3 text-muted-foreground/40 shrink-0" />
            </a>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
