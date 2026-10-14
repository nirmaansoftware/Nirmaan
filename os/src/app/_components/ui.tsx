import Link from "next/link";
import type { Capability } from "@/lib/auth/permissions";

type Tone = "good" | "warn" | "bad" | "info" | "";

const TONES: Record<string, Tone> = {
  // leads
  NEW: "info", DISCOVERY: "info", QUALIFIED: "info", PROPOSAL: "warn", WON: "good", LOST: "bad", SPAM: "",
  // proposals
  DRAFT: "", SENT: "warn", CLARIFICATION_REQUESTED: "bad", APPROVED: "good", REJECTED: "bad", SUPERSEDED: "",
  // approvals & change requests
  PENDING: "warn", OPEN: "warn", ASSESSED: "info", CONVERTED: "good",
  // discovery
  CONFIRMED: "good", ANSWERED: "good",
  // campaigns
  ACTIVE: "good", PAUSED: "warn", DONE: "",
  // prospects & outreach
  AUDITED: "info", DRAFTED: "info", CONTACTED: "warn", REPLIED: "good", DISMISSED: "", DO_NOT_CONTACT: "bad", CANCELLED: "",
  // evidence / deployments
  PASS: "good", FAIL: "bad", SUCCEEDED: "good", FAILED: "bad",
};

export function Badge({ value, tone }: { value: string; tone?: Tone }) {
  const t = tone ?? TONES[value] ?? "";
  return <span className={`badge ${t}`.trim()}>{value.replaceAll("_", " ").toLowerCase()}</span>;
}

export function NoAccess({ capability }: { capability: Capability }) {
  return (
    <div className="panel">
      <h1>No access</h1>
      <p className="muted">
        Your role doesn&apos;t include <code>{capability}</code>. Ask the founder if you need it.
      </p>
      <p>
        <Link href="/os">Back to Today</Link>
      </p>
    </div>
  );
}

export function PageHead({ title, crumbs, children, eyebrow }: { title: string; crumbs?: { href: string; label: string }[]; eyebrow?: string; children?: React.ReactNode }) {
  return (
    <header className="page-head">
      <div>
        {crumbs && (
          <nav className="crumbs" aria-label="Breadcrumb">
            {crumbs.map((c, i) => (
              <span key={c.href}>
                {i > 0 && " / "}
                <Link href={c.href}>{c.label}</Link>
              </span>
            ))}
          </nav>
        )}
        {eyebrow && <span className="label">{eyebrow}</span>}
        <h1>{title}</h1>
      </div>
      {children && <div className="row">{children}</div>}
    </header>
  );
}

export function when(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function ago(d: Date, now = new Date()): string {
  const mins = Math.round((now.getTime() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.round(hrs / 24);
  return `${days} d ago`;
}
