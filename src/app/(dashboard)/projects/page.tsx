"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FolderKanban,
  Plus,
  MessageSquare,
  FileText,
  Clock,
  Search,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, timeAgo } from "@/lib/utils";
import {
  getProjects,
  createProject,
  deleteProject,
  getProjectStats,
  getColorClass,
  type Project,
  type ProjectStats,
} from "@/lib/supabase-projects";
import { toast } from "sonner";

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<(Project & { stats?: ProjectStats })[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const projs = await getProjects();
        // Load stats for each project
        const withStats = await Promise.all(
          projs.map(async (p) => {
            try {
              const stats = await getProjectStats(p.id);
              return { ...p, stats };
            } catch {
              return { ...p, stats: undefined };
            }
          })
        );
        setProjects(withStats);
      } catch {
        toast.error("Failed to load projects");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const project = await createProject(newName.trim(), newDesc.trim() || undefined);
      setNewName("");
      setNewDesc("");
      setShowNew(false);
      toast.success(`Project "${project.name}" created`);
      router.push(`/projects/${project.id}`);
    } catch {
      toast.error("Failed to create project");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    try {
      await deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      setMenuOpenId(null);
      setConfirmDeleteId(null);
      toast.success(`"${name}" deleted`);
    } catch {
      toast.error("Failed to delete project");
    }
  }

  const filtered = searchQuery.trim()
    ? projects.filter(
        (p) =>
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.description?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : projects;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur-md -mx-6 px-6 pt-6 -mt-6 pb-4 relative mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/20">
              <FolderKanban className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
              <p className="text-sm text-muted-foreground">
                {projects.length} project{projects.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <Button
            onClick={() => setShowNew(!showNew)}
            data-tour="projects-new-button"
            className="gap-2 rounded-xl bg-primary/15 hover:bg-primary/25 text-primary ring-1 ring-primary/20"
            variant="ghost"
          >
            <Plus className="h-4 w-4" />
            New Project
          </Button>
        </div>
      </header>

      {/* New project form */}
      {showNew && (
        <div className="mb-6 rounded-2xl bg-card/50 backdrop-blur-xl ring-1 ring-white/[0.08] p-5 animate-in fade-in-0 slide-in-from-top-2 duration-200">
          <h3 className="text-sm font-semibold mb-3">Create New Project</h3>
          <div className="space-y-3">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Project name..."
              className="bg-card/30 border-white/[0.08]"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              autoFocus
            />
            <Input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Description (optional)..."
              className="bg-card/30 border-white/[0.08]"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            <div className="flex gap-2">
              <Button
                onClick={handleCreate}
                disabled={!newName.trim() || creating}
                className="gap-2"
                size="sm"
              >
                <Plus className="h-3.5 w-3.5" />
                {creating ? "Creating..." : "Create Project"}
              </Button>
              <Button
                onClick={() => { setShowNew(false); setNewName(""); setNewDesc(""); }}
                variant="ghost"
                size="sm"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div data-tour="projects-search" className="relative mb-6 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search projects..."
          className="pl-9 bg-card/30 border-white/[0.08]"
        />
      </div>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && projects.length === 0 && (
        <div className="text-center py-20">
          <FolderKanban className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-1">No projects yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Create a project to organize your conversations and files
          </p>
          <Button onClick={() => setShowNew(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Create Your First Project
          </Button>
        </div>
      )}

      {/* Project grid */}
      {!loading && filtered.length > 0 && (
        <div data-tour="projects-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((project, idx) => (
            <div key={project.id} className="relative group/card" {...(idx === 0 ? { "data-tour": "project-card-first" } : {})}>
              <Link href={`/projects/${project.id}`}>
                <div className="rounded-2xl bg-card/40 backdrop-blur-xl ring-1 ring-white/[0.08] p-5 transition-all duration-300 hover:bg-card/60 hover:ring-primary/20 hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-0.5 cursor-pointer h-full">
                  {/* Color bar */}
                  <div className={cn("h-1 w-12 rounded-full mb-4", getColorClass(project.color))} />

                  <h3 className="text-base font-semibold mb-1 group-hover/card:text-primary transition-colors">
                    {project.name}
                  </h3>
                  {project.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-4">
                      {project.description}
                    </p>
                  )}

                  {/* Stats */}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground/60">
                    <div className="flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      <span>{project.stats?.conversationCount ?? 0} chats</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      <span>{project.stats?.documentCount ?? 0} files</span>
                    </div>
                    {project.stats?.lastActivity && (
                      <div className="flex items-center gap-1 ml-auto">
                        <Clock className="h-3 w-3" />
                        <span>{timeAgo(project.stats.lastActivity)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </Link>

              {/* Action menu */}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenuOpenId(menuOpenId === project.id ? null : project.id);
                  setConfirmDeleteId(null);
                }}
                className={cn(
                  "absolute right-3 top-3 h-7 w-7 flex items-center justify-center rounded-lg transition-opacity z-10",
                  menuOpenId === project.id
                    ? "opacity-100 bg-white/[0.08]"
                    : "opacity-0 group-hover/card:opacity-100 hover:bg-white/[0.08]"
                )}
              >
                <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
              </button>

              {menuOpenId === project.id && (
                <div className="absolute right-3 top-11 z-50 w-40 rounded-lg bg-card/95 backdrop-blur-2xl ring-1 ring-white/[0.1] shadow-xl shadow-black/30 py-1 animate-in fade-in-0 zoom-in-95 duration-100">
                  {confirmDeleteId === project.id ? (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDelete(project.id, project.name);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Confirm delete
                    </button>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setConfirmDeleteId(project.id);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete Project
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* No search results */}
      {!loading && filtered.length === 0 && projects.length > 0 && (
        <div className="text-center py-12">
          <Search className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No projects match your search</p>
        </div>
      )}
    </div>
  );
}
