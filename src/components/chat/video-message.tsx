"use client";

import { useState } from "react";
import { Download, ExternalLink, Copy, Check, FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface VideoMessageProps {
  prompt: string;
  path: string;
  duration: string;
  resolution: string;
  size: string;
  model: string;
  projectId?: string | null;
}

/** Parse a Video Gen response into structured data, or return null if not a video response */
export function parseVideoResponse(text: string): VideoMessageProps | null {
  if (!text.includes("Video generated") || !text.includes("Path:")) return null;

  const promptMatch = text.match(/Prompt:\s*(.+)/);
  const pathMatch = text.match(/Path:\s*(.+)/);
  const durationMatch = text.match(/Duration:\s*(.+)/);
  const resolutionMatch = text.match(/Resolution:\s*(.+)/);
  const sizeMatch = text.match(/Size:\s*(.+)/);
  const modelMatch = text.match(/Model:\s*(.+)/);

  if (!pathMatch) return null;

  return {
    prompt: promptMatch?.[1]?.trim() || "Generated video",
    path: pathMatch[1].trim(),
    duration: durationMatch?.[1]?.trim() || "",
    resolution: resolutionMatch?.[1]?.trim() || "",
    size: sizeMatch?.[1]?.trim() || "",
    model: modelMatch?.[1]?.trim() || "Seedance",
  };
}

export function VideoMessage({ prompt, path, duration, resolution, size, model, projectId }: VideoMessageProps) {
  const [copied, setCopied] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const videoUrl = `/api/media?path=${encodeURIComponent(path)}`;

  function handleCopy() {
    navigator.clipboard.writeText(path);
    setCopied(true);
    toast.success("Path copied");
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSaveToDocuments() {
    if (saving || saved) return;
    setSaving(true);
    try {
      const res = await fetch(videoUrl);
      if (!res.ok) throw new Error("Failed to fetch video");
      const blob = await res.blob();
      const filename = path.split("/").pop() || "generated_video.mp4";
      const file = new File([blob], filename, { type: "video/mp4" });

      const { uploadDocument } = await import("@/lib/supabase-documents");
      await uploadDocument(file, "Video Gen", prompt.slice(0, 100), ["generated", "video"], projectId || undefined);

      setSaved(true);
      toast.success("Video saved to Documents");
    } catch {
      toast.error("Failed to save video");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Video player */}
      {!videoError ? (
        <div className="rounded-xl overflow-hidden ring-1 ring-white/[0.08] max-w-md">
          <video
            src={videoUrl}
            controls
            playsInline
            className="w-full h-auto"
            onError={() => setVideoError(true)}
          />
        </div>
      ) : (
        <div className="rounded-xl bg-white/[0.03] ring-1 ring-white/[0.06] p-4 max-w-md">
          <p className="text-xs text-muted-foreground">Video preview unavailable</p>
          <p className="text-[10px] text-muted-foreground/50 mt-1 font-mono truncate">{path}</p>
        </div>
      )}

      {/* Caption */}
      <p className="text-xs text-muted-foreground italic">&ldquo;{prompt}&rdquo;</p>

      {/* Meta + actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {duration && (
          <span className="text-[10px] text-muted-foreground/50">{duration}</span>
        )}
        {resolution && (
          <span className="text-[10px] text-muted-foreground/50">{resolution}</span>
        )}
        {size && (
          <span className="text-[10px] text-muted-foreground/50">{size}</span>
        )}
        <span className="text-[10px] text-muted-foreground/50">{model}</span>
        <div className="flex gap-1 ml-auto">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCopy}
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            title="Copy path"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
          {!videoError && (
            <a href={videoUrl} target="_blank" rel="noopener noreferrer">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                title="Open full size"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </a>
          )}
          {!videoError && (
            <a href={videoUrl} download={prompt.slice(0, 50) + ".mp4"}>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                title="Download"
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
            </a>
          )}
          {!videoError && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSaveToDocuments}
              disabled={saving || saved}
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              title={saved ? "Saved to Documents" : "Save to Documents"}
            >
              {saved ? (
                <Check className="h-3.5 w-3.5 text-green-400" />
              ) : (
                <FolderPlus className="h-3.5 w-3.5" />
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
