import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { getSupabaseAdmin, MEDIA_BUCKET, isCloudConfigured } from "@/lib/supabase";

const localDir = () => path.join(process.cwd(), ".data", "media");

export function mediaContentType(filename: string) {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    case ".ogg":
      return "audio/ogg";
    case ".webm":
      return "audio/webm";
    case ".m4a":
      return "audio/mp4";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    case ".json":
      return "application/json";
    default:
      return "application/octet-stream";
  }
}

export function isImageFilename(filename: string) {
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(filename);
}

export async function saveMedia(
  filename: string,
  buf: Buffer,
  contentType?: string,
): Promise<{ key: string; backend: "supabase" | "local" }> {
  const safe = filename.replace(/[^\w.\-/]+/g, "_");
  const type = contentType || mediaContentType(safe);
  const supabase = getSupabaseAdmin();

  if (supabase && isCloudConfigured()) {
    const { error } = await supabase.storage
      .from(MEDIA_BUCKET)
      .upload(safe, buf, { contentType: type, upsert: true });
    if (error) throw new Error(error.message);
    return { key: safe, backend: "supabase" };
  }

  const dir = localDir();
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, path.basename(safe)), buf);
  return { key: path.basename(safe), backend: "local" };
}

export async function loadMedia(
  filename: string,
): Promise<{ buf: Buffer; contentType: string } | null> {
  const safe = filename.replace(/\.\./g, "");
  const type = mediaContentType(safe);
  const supabase = getSupabaseAdmin();

  if (supabase && isCloudConfigured()) {
    const { data, error } = await supabase.storage.from(MEDIA_BUCKET).download(safe);
    if (!error && data) {
      const ab = await data.arrayBuffer();
      return { buf: Buffer.from(ab), contentType: type };
    }
  }

  try {
    const buf = await readFile(path.join(localDir(), path.basename(safe)));
    return { buf, contentType: type };
  } catch {
    return null;
  }
}
