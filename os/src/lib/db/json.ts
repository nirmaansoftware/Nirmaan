/**
 * SQLite has no native scalar list type, so list fields (dependencies,
 * blockers, assumptions, tags, ...) are stored as JSON-encoded TEXT.
 * These are the only two functions that should touch that encoding.
 */

export function encodeStringList(items: string[]): string {
  return JSON.stringify(items);
}

export function decodeStringList(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
