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
  if (start === -1 || end <= start) throw new Error(`${who}'s reply didn't contain a JSON object. ${said(raw)}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate.slice(start, end + 1));
  } catch {
    throw new Error(`${who}'s reply wasn't valid JSON. ${said(raw)}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${who}'s reply wasn't a JSON object.`);
  return parsed as Record<string, unknown>;
}

/** The start of what the model actually said, so a failure can be diagnosed from the error alone. */
function said(raw: string): string {
  const t = raw.trim().replace(/\s+/g, " ");
  return t ? `It said: "${t.slice(0, 200)}${t.length > 200 ? "…" : ""}"` : "The reply was empty.";
}

/** A trimmed, length-capped string, or "" if the value isn't a string. */
export function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** A capped list of non-empty, capped strings. */
export function textList(value: unknown, maxItems: number, maxLen: number): string[] {
  return Array.isArray(value) ? value.map((v) => text(v, maxLen)).filter(Boolean).slice(0, maxItems) : [];
}
