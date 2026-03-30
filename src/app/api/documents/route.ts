import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

function categorizeFile(mimeType: string, filename: string): string {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  if (
    mimeType.includes("spreadsheet") ||
    mimeType.includes("csv") ||
    filename.match(/\.(xlsx?|csv|ods)$/i)
  )
    return "spreadsheet";
  if (
    mimeType.includes("presentation") ||
    filename.match(/\.(pptx?|odp)$/i)
  )
    return "presentation";
  if (
    mimeType.includes("document") ||
    mimeType.includes("msword") ||
    mimeType.includes("text/") ||
    filename.match(/\.(docx?|odt|txt|md|rtf)$/i)
  )
    return "document";
  return "other";
}

/**
 * POST /api/documents — Upload a document
 * Accepts multipart/form-data with:
 *   - file: the file
 *   - agent_name (optional): which agent created it
 *   - description (optional): file description
 *   - tags (optional): comma-separated tags
 */
export async function POST(request: NextRequest) {
  // Verify API key for agent uploads
  const apiKey = request.headers.get("x-api-key");
  const expectedKey = process.env.HARV_API_KEY;
  if (expectedKey && apiKey !== expectedKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const agentName = (formData.get("agent_name") as string) || null;
    const description = (formData.get("description") as string) || null;
    const tagsRaw = (formData.get("tags") as string) || "";
    const tags = tagsRaw
      ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)
      : [];

    const supabase = createServiceClient();
    const fileType = categorizeFile(file.type, file.name);
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${agentName || "manual"}/${timestamp}_${safeName}`;

    // Read file into buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: `Upload failed: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // Create metadata row
    const { data, error } = await supabase
      .from("documents")
      .insert({
        filename: file.name,
        file_type: fileType,
        mime_type: file.type,
        file_size: file.size,
        storage_path: storagePath,
        agent_name: agentName,
        tags,
        description,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: `Metadata save failed: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ document: data }, { status: 201 });
  } catch (err) {
    console.error("Document upload error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
