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
