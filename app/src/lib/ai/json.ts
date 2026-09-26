/**
 * Pulls the single JSON object out of a model reply. Accepts a bare object or
 * one inside a ```json fence; throws (never guesses) on anything else. Shape
 * validation is the caller's job.
 */
export function extractJsonObject(raw: string, who = "The agent"): Record<string, unknown> {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(raw);
  const candidate = (fenced ? fenced[1] : raw).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error(`${who}'s reply didn't contain a JSON object.`);
  let parsed: unknown;
  const body = candidate.slice(start, end + 1);
  try {
    parsed = JSON.parse(body);
  } catch {
    // Models sometimes put real line breaks inside a string ("body": "Hi,
    // …"). That's the one slip we repair; anything else is still refused.
    try {
      parsed = JSON.parse(escapeControlCharsInStrings(body));
    } catch {
      throw new Error(`${who}'s reply wasn't valid JSON.`);
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${who}'s reply wasn't a JSON object.`);
  return parsed as Record<string, unknown>;
}

/** A trimmed, length-capped string, or "" if the value isn't a string. */
export function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** A capped list of non-empty, capped strings. */
export function textList(value: unknown, maxItems: number, maxLen: number): string[] {
  return Array.isArray(value) ? value.map((v) => text(v, maxLen)).filter(Boolean).slice(0, maxItems) : [];
}

/** Escapes raw newlines, tabs and other control characters that appear inside JSON string literals. */
export function escapeControlCharsInStrings(json: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const ch of json) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      else if (ch < " ") {
        out += ch === "\n" ? "\\n" : ch === "\r" ? "\\r" : ch === "\t" ? "\\t" : `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`;
        continue;
      }
    } else if (ch === '"') inString = true;
    out += ch;
  }
  return out;
}
