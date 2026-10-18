/** Resolve a stored media key to a browser-usable URL */
export function mediaUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  if (
    key.startsWith("blob:") ||
    key.startsWith("data:") ||
    key.startsWith("http://") ||
    key.startsWith("https://")
  ) {
    return key;
  }
  return `/api/media/${key.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * Cards may store one image, or several joined with `||`
 * (e.g. whole fish + sushi form). Filenames never contain `||`.
 */
export function parseImageKeys(imageKey: string | null | undefined): string[] {
  if (!imageKey?.trim()) return [];
  return imageKey
    .split("||")
    .map((k) => k.trim())
    .filter(Boolean);
}

export function joinImageKeys(keys: Array<string | null | undefined>): string | null {
  const cleaned = keys.map((k) => (k ?? "").trim()).filter(Boolean);
  if (!cleaned.length) return null;
  return cleaned.join("||");
}

export function mediaUrls(imageKey: string | null | undefined): string[] {
  return parseImageKeys(imageKey)
    .map((k) => mediaUrl(k))
    .filter((u): u is string => Boolean(u));
}
