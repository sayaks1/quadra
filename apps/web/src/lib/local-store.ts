import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { QuadraStore } from "@quadra/shared";

const storePath = () => path.join(process.cwd(), ".data", "store.json");

/** True on Vercel/serverless where the app filesystem is read-only. */
export function isEphemeralFs() {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

export async function readLocalStore(): Promise<QuadraStore | null> {
  try {
    const raw = await readFile(storePath(), "utf8");
    return JSON.parse(raw) as QuadraStore;
  } catch {
    return null;
  }
}

/**
 * Best-effort local mirror. On Vercel this is a no-op — Supabase is the
 * source of truth and `/var/task` is read-only (EROFS).
 */
export async function writeLocalStore(store: QuadraStore): Promise<void> {
  if (isEphemeralFs()) return;
  try {
    await mkdir(path.dirname(storePath()), { recursive: true });
    await writeFile(storePath(), JSON.stringify(store, null, 2), "utf8");
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: string }).code)
        : "";
    if (code === "EROFS" || code === "EACCES") return;
    throw err;
  }
}
