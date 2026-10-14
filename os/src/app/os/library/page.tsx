import type { Metadata } from "next";
import { prisma } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/web/session";
import { decodeStringList } from "@/lib/db/json";
import { ASSET_CATEGORIES, PROVEN_AFTER_PROJECTS } from "@/lib/db/enums";
import { ActionForm } from "@/app/_components/ActionForm";
import { Badge, NoAccess, PageHead } from "@/app/_components/ui";
import { saveAssetAction } from "@/app/os/actions/knowledge";

export const metadata: Metadata = { title: "IP library" };

const label = (c: string) => c.replaceAll("_", " ").toLowerCase();

export default async function IpPage() {
  const user = await requireUser();
  if (!can(user.role, "knowledge:read")) return <NoAccess capability="knowledge:read" />;
  const assets = await prisma.asset.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
    include: { uses: { include: { project: { select: { code: true, name: true } } } } },
  });
  return (
    <>
      <PageHead title="IP library" eyebrow="Knowledge & IP" />
      <p className="muted">
        Build once, reuse many times. Assets are harvested from delivered work. Maturity is earned: used once, then proven after {PROVEN_AFTER_PROJECTS} projects.
        Client-specific code never goes in here. The code itself lives in a private repository.
      </p>
      <div className="split">
        <section className="panel" aria-label="Assets">
          {assets.length === 0 ? (
            <p className="empty">No assets yet. Add one when a project produces something worth reusing.</p>
          ) : (
            <ul className="list" role="list">
              {assets.map((a) => (
                <li key={a.id}>
                  <div className="item-head">
                    <span>
                      <span className="mono">{a.code}</span> <b>{a.name}</b> <span className="faint">v{a.version} · {label(a.category)}</span>
                    </span>
                    <Badge value={a.maturity} tone={a.maturity === "PROVEN" ? "good" : a.maturity === "USED_ONCE" ? "info" : ""} />
                  </div>
                  <p style={{ fontSize: "0.875rem" }}>{a.description}</p>
                  <span className="faint" style={{ fontSize: "0.8125rem" }}>
                    Owner {a.owner} · used on {a.uses.length} project(s){a.uses.length > 0 && `: ${a.uses.map((u) => u.project.code ?? u.project.name).join(", ")}`}
                    {decodeStringList(a.dependencies).length > 0 && ` · needs ${decodeStringList(a.dependencies).join(", ")}`}
                  </span>
                  <details className="disclose">
                    <summary>How to use</summary>
                    <p className="prewrap" style={{ fontSize: "0.8125rem" }}>{a.usage}</p>
                    {(a.docsUrl || a.repoUrl) && (
                      <p className="row" style={{ fontSize: "0.8125rem" }}>
                        {a.docsUrl && <a href={a.docsUrl} rel="noopener noreferrer" target="_blank">Docs</a>}
                        {a.repoUrl && <a href={a.repoUrl} rel="noopener noreferrer" target="_blank">Code</a>}
                      </p>
                    )}
                  </details>
                </li>
              ))}
            </ul>
          )}
        </section>
        {can(user.role, "ip:write") && (
          <section className="panel" aria-labelledby="add-asset">
            <h2 id="add-asset">Add an asset</h2>
            <ActionForm action={saveAssetAction} submit="Add to library">
              <input className="input" name="name" placeholder="Name, e.g. Role-based access module" aria-label="Name" required />
              <div className="form-row">
                <select className="input" name="category" aria-label="Category" defaultValue="AUTHENTICATION">
                  {ASSET_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {label(c)}
                    </option>
                  ))}
                </select>
                <input className="input" name="version" defaultValue="0.1.0" aria-label="Version" required />
              </div>
              <textarea className="input" name="description" rows={2} placeholder="What it does and when to use it" aria-label="Description" required />
              <textarea className="input" name="usage" rows={4} placeholder="How to use it" aria-label="Usage" required />
              <textarea className="input" name="dependencies" rows={2} placeholder="Dependencies, one per line" aria-label="Dependencies" />
              <input className="input" name="owner" defaultValue={user.name} aria-label="Owner" required />
              <div className="form-row">
                <input className="input" name="docsUrl" placeholder="Docs URL" aria-label="Docs URL" />
                <input className="input" name="repoUrl" placeholder="Private repo URL" aria-label="Repository URL" />
              </div>
            </ActionForm>
          </section>
        )}
      </div>
    </>
  );
}
