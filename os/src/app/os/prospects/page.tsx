import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/web/session";
import { decodeStringList } from "@/lib/db/json";
import { OPEN_PROSPECT_STATUSES, PROSPECT_SEGMENTS, PROSPECT_SEGMENT_LABELS, PROSPECT_STATUSES, isOneOf } from "@/lib/db/enums";
import { packageName } from "@/lib/prospecting/basics";
import { placesConfigured } from "@/lib/prospecting/places";
import { sendingConfigured } from "@/lib/prospecting/mailer";
import { ActionForm } from "../../_components/ActionForm";
import { Badge, NoAccess, PageHead, ago } from "../../_components/ui";
import { auditNextAction, runSearchAction } from "../actions/prospects";

export const metadata: Metadata = { title: "Prospects" };

export default async function ProspectsPage({ searchParams }: PageProps<"/os/prospects">) {
  const user = await requireUser();
  if (!can(user.role, "prospect:read")) return <NoAccess capability="prospect:read" />;
  const params = await searchParams;
  const status = typeof params.status === "string" ? params.status : undefined;
  const searchId = typeof params.search === "string" ? params.search : undefined;
  const statuses = isOneOf(PROSPECT_STATUSES, status) ? [status] : status === "all" ? [...PROSPECT_STATUSES] : [...OPEN_PROSPECT_STATUSES];
  const canRun = can(user.role, "prospect:run");

  const [prospects, counts, searches, current] = await Promise.all([
    prisma.prospect.findMany({
      where: { status: { in: statuses }, ...(searchId ? { searchId } : {}) },
      orderBy: [{ fitScore: { sort: "desc", nulls: "last" } }, { ratingCount: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: 300,
    }),
    prisma.prospect.groupBy({ by: ["status"], _count: true, ...(searchId ? { where: { searchId } } : {}) }),
    prisma.prospectSearch.findMany({ orderBy: { createdAt: "desc" }, take: 6 }),
    searchId ? prisma.prospectSearch.findUnique({ where: { id: searchId } }) : Promise.resolve(null),
  ]);
  const countOf = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const unchecked = countOf("NEW");
  const filterHref = (s?: string) => {
    const q = new URLSearchParams();
    if (s) q.set("status", s);
    if (searchId) q.set("search", searchId);
    const qs = q.toString();
    return qs ? `/os/prospects?${qs}` : "/os/prospects";
  };
  const places = placesConfigured();
  const sending = sendingConfigured();

  return (
    <>
      <PageHead title="Prospects" eyebrow="Pipeline">
        <Link className="btn ghost" href="/os/prospects/do-not-contact">
          Do not contact
        </Link>
      </PageHead>

      {(!places || !sending) && (
        <div className="notice" role="note">
          {!places && (
            <p>
              <b>Google Places isn&apos;t set up</b>, so searches use the web only. Add <code>GOOGLE_PLACES_API_KEY</code> for complete lists of local businesses.
            </p>
          )}
          {!sending && (
            <p>
              <b>Email sending isn&apos;t set up</b>, so approved emails are copied and sent by you. Add <code>OUTREACH_FROM</code> and <code>SMTP_URL</code> to send from here.
            </p>
          )}
          <p className="faint">
            See <code>docs/product/prospecting.md</code>.
          </p>
        </div>
      )}

      {canRun && (
        <section className="panel" aria-labelledby="find">
          <h2 id="find">Find businesses</h2>
          <p className="muted">
            Describe who to look for and where. Results are checked and scored before anyone is contacted, and nothing is sent without your approval.
          </p>
          <ActionForm action={runSearchAction} submit="Search" pendingLabel="Searching… (the web search can take a couple of minutes)">
            <div className="form-row">
              <div className="field">
                <label htmlFor="query">What kind of business</label>
                <input className="input" id="query" name="query" required minLength={3} maxLength={100} placeholder="dental clinics, bakeries, textile traders…" />
              </div>
              <div className="field">
                <label htmlFor="location">Where</label>
                <input className="input" id="location" name="location" required minLength={2} maxLength={80} placeholder="Ahmedabad" />
              </div>
              <div className="field">
                <label htmlFor="segment">Who it&apos;s for</label>
                <select className="input" id="segment" name="segment" defaultValue="LOCAL_SERVICE">
                  {PROSPECT_SEGMENTS.map((s) => (
                    <option key={s} value={s}>
                      {PROSPECT_SEGMENT_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <fieldset className="row" style={{ border: 0, padding: 0 }}>
              <legend className="label">Search</legend>
              <label className="check">
                <input type="checkbox" name="sources" value="PLACES" defaultChecked={places} disabled={!places} /> Google Places{!places && " (not set up)"}
              </label>
              <label className="check">
                <input type="checkbox" name="sources" value="WEB" defaultChecked /> The web
              </label>
            </fieldset>
          </ActionForm>
        </section>
      )}

      {searches.length > 0 && (
        <section className="panel" aria-labelledby="recent">
          <div className="panel-head">
            <h2 id="recent">Recent searches</h2>
            {searchId && <Link href="/os/prospects">Show all prospects</Link>}
          </div>
          <ul className="list" role="list">
            {searches.map((s) => (
              <li key={s.id}>
                <div className="item-head">
                  <Link href={`/os/prospects?search=${s.id}`} aria-current={s.id === searchId ? "true" : undefined}>
                    {s.query} in {s.location}
                  </Link>
                  <span className="faint">
                    {decodeStringList(s.sources).map((x) => (x === "PLACES" ? "Places" : "web")).join(" + ")} · {s.found} found, {s.added} new · {ago(s.createdAt)}
                  </span>
                </div>
                {s.notes && <p className="faint">{s.notes}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <nav className="row" aria-label="Filter by status">
        <Link className={`btn sm ${status ? "ghost" : ""}`} href={filterHref()}>
          Open
        </Link>
        {PROSPECT_STATUSES.map((s) => (
          <Link key={s} className={`btn sm ${status === s ? "" : "ghost"}`} href={filterHref(s)}>
            {s.replaceAll("_", " ").toLowerCase()} <span className="faint num">{countOf(s)}</span>
          </Link>
        ))}
        <Link className={`btn sm ${status === "all" ? "" : "ghost"}`} href={filterHref("all")}>
          all
        </Link>
      </nav>

      <div className="panel">
        <div className="panel-head">
          <h2>{current ? `${current.query} in ${current.location}` : "All searches"}</h2>
          {canRun && unchecked > 0 && (
            <ActionForm action={auditNextAction} submit={`Check the next ${Math.min(3, unchecked)} of ${unchecked}`} pendingLabel="Checking websites and scoring… (up to a minute each)" variant="ghost sm" className="">
              <input type="hidden" name="searchId" value={searchId ?? ""} />
            </ActionForm>
          )}
        </div>
        {prospects.length === 0 ? (
          <p className="empty">No prospects here yet. Run a search above.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Fit</th>
                  <th>Likely problem</th>
                  <th>Reach</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {prospects.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link className="code" href={`/os/prospects/${p.id}`}>
                        {p.code}
                      </Link>
                      <div>{p.name}</div>
                      <div className="faint">
                        {[p.category, p.city].filter(Boolean).join(" · ")}
                        {p.rating != null && ` · ★ ${p.rating} (${p.ratingCount ?? 0})`}
                      </div>
                    </td>
                    <td className="num">
                      {p.fitScore == null ? <span className="faint">not checked</span> : <b>{p.fitScore}</b>}
                      {p.suggestedPackage && <div className="faint">{packageName(p.suggestedPackage)}</div>}
                    </td>
                    <td style={{ maxWidth: "30rem" }}>{p.problem ?? <span className="faint">{p.sourceNote ?? "—"}</span>}</td>
                    <td className="faint">{[p.email && "email", p.phone && "phone", p.website ? "site" : "no site"].filter(Boolean).join(" · ")}</td>
                    <td>
                      <Badge value={p.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
