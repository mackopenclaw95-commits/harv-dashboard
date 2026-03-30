"use client";

import { useState } from "react";
import { Download, ExternalLink, Copy, Check, FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface ImageMessageProps {
  prompt: string;
  path: string;
  size: string;
  model: string;
  projectId?: string | null;
}

/** Parse an Image Gen response into structured data, or return null if not an image response */
export function parseImageResponse(text: string): ImageMessageProps | null {
  if (!text.includes("Image generated") || !text.includes("Path:")) return null;

  const promptMatch = text.match(/Prompt:\s*(.+)/);
  const pathMatch = text.match(/Path:\s*(.+)/);
  const sizeMatch = text.match(/Size:\s*(.+)/);
  const modelMatch = text.match(/Model:\s*(.+)/);

  if (!pathMatch) return null;

  return {
    prompt: promptMatch?.[1]?.trim() || "Generated image",
    path: pathMatch[1].trim(),
    size: sizeMatch?.[1]?.trim() || "",
    model: modelMatch?.[1]?.trim() || "Imagen",
  };
}

export function ImageMessage({ prompt, path, size, model, projectId }: ImageMessageProps) {
  const [copied, setCopied] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const imageUrl = `/api/media?path=${encodeURIComponent(path)}`;

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
      // Fetch the image via our proxy
      const res = await fetch(imageUrl);
      if (!res.ok) throw new Error("Failed to fetch image");
      const blob = await res.blob();

      // Create a File from the blob
      const filename = path.split("/").pop() || "generated_image.png";
      const file = new File([blob], filename, { type: "image/png" });

      // Upload to Supabase documents
      const { uploadDocument } = await import("@/lib/supabase-documents");
      await uploadDocument(file, "Image Gen", prompt.slice(0, 100), ["generated", "image"], projectId || undefined);

      setSaved(true);
      toast.success("Image saved to Documents");
    } catch (err) {
      toast.error("Failed to save image");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Image preview */}
      {!imgError ? (
        <div className="rounded-xl overflow-hidden ring-1 ring-white/[0.08] max-w-sm">
          <img
            src={imageUrl}
            alt={prompt}
            className="w-full h-auto"
            onError={() => setImgError(true)}
          />
        </div>
      ) : (
        <div className="rounded-xl bg-white/[0.03] ring-1 ring-white/[0.06] p-4 max-w-sm">
          <p className="text-xs text-muted-foreground">Image preview unavailable</p>
          <p className="text-[10px] text-muted-foreground/50 mt-1 font-mono truncate">{path}</p>
        </div>
      )}

      {/* Caption */}
      <p className="text-xs text-muted-foreground italic">&ldquo;{prompt}&rdquo;</p>

      {/* Meta + actions */}
      <div className="flex items-center gap-2 flex-wrap">
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
          {!imgError && (
            <a href={imageUrl} target="_blank" rel="noopener noreferrer">
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
          {!imgError && (
            <a href={imageUrl} download={prompt.slice(0, 50) + ".png"}>
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
          {!imgError && (
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
