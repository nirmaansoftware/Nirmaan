import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { withScheme } from "./basics";

/**
 * Fetches a prospect's public website for the site check. The URL comes
 * from outside (Google, a web page, a person), so this refuses anything that
 * isn't a public http(s) address: no localhost, private networks, cloud
 * metadata endpoints or odd ports, re-checked on every redirect. Time and
 * size are capped, and the page is only ever read as text.
 */
export interface FetchedSite {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  html: string;
  bytes: number;
  ms: number;
  truncated: boolean;
}

export type SiteFetcher = (url: string) => Promise<FetchedSite>;

const MAX_BYTES = 1_500_000;
const TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 4;

export class UnsafeUrlError extends Error {
  constructor(reason: string) {
    super(`Won't fetch that address: ${reason}.`);
    this.name = "UnsafeUrlError";
  }
}

/** True for loopback, private, link-local, carrier-grade NAT, multicast and other non-public addresses. */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(x);
    if (mapped) return isPrivateAddress(mapped[1]);
    return x === "::" || x === "::1" || /^f[cd]/.test(x) || /^fe[89ab]/.test(x) || x.startsWith("ff");
  }
  return true; // not an IP at all: refuse
}

async function assertPublic(url: URL, resolve: (host: string) => Promise<string[]>) {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new UnsafeUrlError("only http and https");
  if (url.username || url.password) throw new UnsafeUrlError("credentials in the address");
  if (url.port && url.port !== "80" && url.port !== "443") throw new UnsafeUrlError("unusual port");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (/(^|\.)(localhost|local|internal|intranet|lan|home\.arpa)$/i.test(host)) throw new UnsafeUrlError("not a public internet address");
  const addresses = isIP(host) ? [host] : await resolve(host).catch((err: { code?: string }) => {
    // ENOTFOUND/ENODATA: the domain really has no address (a dead link). Anything else: we couldn't tell.
    throw new UnsafeUrlError(err?.code === "ENOTFOUND" || err?.code === "ENODATA" ? "the domain doesn't exist" : "the domain couldn't be looked up");
  });
  if (!addresses.length || addresses.some(isPrivateAddress)) throw new UnsafeUrlError("not a public internet address");
}

const dnsResolve = async (host: string) => (await lookup(host, { all: true })).map((a) => a.address);

export async function fetchSite(
  rawUrl: string,
  opts: { resolve?: (host: string) => Promise<string[]>; fetchImpl?: typeof fetch } = {}
): Promise<FetchedSite> {
  const resolve = opts.resolve ?? dnsResolve;
  const doFetch = opts.fetchImpl ?? fetch;
  const started = Date.now();
  let url = new URL(withScheme(rawUrl));

  for (let hop = 0; ; hop++) {
    await assertPublic(url, resolve);
    const res = await doFetch(url, {
      redirect: "manual",
      // A normal browser's headers, so we see the page a visitor sees (many sites refuse unknown clients).
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "en-IN,en;q=0.9",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      if (hop >= MAX_REDIRECTS) throw new Error("The site redirects too many times.");
      url = new URL(location, url);
      continue;
    }
    const { text, bytes, truncated } = await readCapped(res);
    return { requestedUrl: rawUrl, finalUrl: url.toString(), status: res.status, html: text, bytes, ms: Date.now() - started, truncated };
  }
}

async function readCapped(res: Response): Promise<{ text: string; bytes: number; truncated: boolean }> {
  if (!res.body) return { text: "", bytes: 0, truncated: false };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_BYTES) {
      truncated = true;
      await reader.cancel().catch(() => undefined);
      break;
    }
    chunks.push(value);
  }
  return { text: new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks)), bytes, truncated };
}
