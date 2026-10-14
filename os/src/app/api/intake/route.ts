import { NextResponse, type NextRequest } from "next/server";
import { createLead, validateIntake } from "@/lib/leads/intake";
import { createRateLimiter } from "@/lib/http/rateLimit";
import { PUBLIC_ACTOR } from "@/lib/auth/actor";

/**
 * POST /api/intake: the public website's "Tell us your problem" form.
 *
 * Accepts JSON or form data. CORS is limited to the origins in
 * NIRMAAN_INTAKE_ORIGINS (default: the public site). Bots get the same
 * "thanks" as people (honeypot), so they can't tell they were filtered.
 * Responses never echo stored data back.
 */
const allow = createRateLimiter({ limit: 5, windowMs: 10 * 60 * 1000 });
const MAX_BODY_BYTES = 32 * 1024;

function allowedOrigins(): string[] {
  return (process.env.NIRMAAN_INTAKE_ORIGINS ?? "https://nirmaan.online,https://www.nirmaan.online")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

function corsHeaders(origin: string | null): HeadersInit {
  const headers: Record<string, string> = { Vary: "Origin" };
  if (origin && allowedOrigins().includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type, Accept";
    headers["Access-Control-Max-Age"] = "600";
  }
  return headers;
}

export function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);
  const reply = (status: number, body: object, extra: HeadersInit = {}) =>
    NextResponse.json(body, { status, headers: { ...headers, ...extra } });

  // Browsers always send Origin on cross-site POSTs; refuse ones we don't serve.
  if (origin && !allowedOrigins().includes(origin) && origin !== request.nextUrl.origin && origin !== process.env.NIRMAAN_OS_URL?.replace(/\/+$/, "")) {
    return reply(403, { errors: [{ message: "This form can only be submitted from nirmaan.online." }] });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const gate = allow(ip);
  if (!gate.ok) {
    return reply(429, { errors: [{ message: "Too many submissions from your network. Please try again shortly." }] }, { "Retry-After": String(gate.retryAfterSec) });
  }

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return reply(413, { errors: [{ message: "That's more text than the form accepts. Please shorten it." }] });

  let input: Record<string, unknown>;
  try {
    const type = request.headers.get("content-type") ?? "";
    if (type.includes("application/json")) {
      const raw = await request.text();
      if (raw.length > MAX_BODY_BYTES) return reply(413, { errors: [{ message: "That's more text than the form accepts. Please shorten it." }] });
      input = JSON.parse(raw);
    } else {
      input = Object.fromEntries([...(await request.formData()).entries()].filter(([, v]) => typeof v === "string"));
    }
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("bad body");
  } catch {
    return reply(400, { errors: [{ message: "We couldn't read that submission." }] });
  }

  const result = validateIntake(input);
  if (!result.ok) {
    if (result.errors.form === "spam") return reply(200, { ok: true });
    return reply(422, { errors: Object.entries(result.errors).map(([field, message]) => ({ field, message })) });
  }

  try {
    await createLead(PUBLIC_ACTOR, result.data, "WEBSITE");
  } catch {
    return reply(500, { errors: [{ message: "We couldn't save your message. Please email us instead." }] });
  }
  return reply(201, { ok: true });
}
