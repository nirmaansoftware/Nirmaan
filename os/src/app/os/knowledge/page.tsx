import type { Metadata } from "next";
import Link from "next/link";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/web/session";
import { searchArticles } from "@/lib/knowledge/service";
import { decodeStringList } from "@/lib/db/json";
import { ActionForm } from "../../_components/ActionForm";
import { NoAccess, PageHead, ago } from "../../_components/ui";
import { createArticleAction } from "../actions/knowledge";

export const metadata: Metadata = { title: "Knowledge" };

export default async function KnowledgePage({ searchParams }: PageProps<"/os/knowledge">) {
  const user = await requireUser();
  if (!can(user.role, "knowledge:read")) return <NoAccess capability="knowledge:read" />;
  const q = (await searchParams).q;
  const query = typeof q === "string" ? q : "";
  const articles = await searchArticles(query);
  return (
    <>
      <PageHead title="Knowledge" eyebrow="Knowledge & IP" />
      <p className="muted">
        Standards, how-tos and lessons. Post-mortems add their lessons here automatically, so each project teaches the next one. Internal only.
      </p>
      <form className="row" action="/os/knowledge" role="search">
        <input className="input" name="q" defaultValue={query} placeholder="Search titles, content and tags" aria-label="Search the knowledge base" style={{ maxWidth: "24rem" }} />
        <button className="btn ghost" type="submit">
          Search
        </button>
      </form>
      <div className="split">
        <section className="panel" aria-label="Articles">
          {articles.length === 0 ? (
            <p className="empty">{query ? `Nothing matches "${query}".` : "No articles yet."}</p>
          ) : (
            <ul className="list" role="list">
              {articles.map((a) => (
                <li key={a.id}>
                  <div className="item-head">
                    <Link href={`/os/knowledge/${a.id}`}>{a.title}</Link>
                    {a.source === "POST_MORTEM" && <span className="badge info">post-mortem</span>}
                  </div>
                  <span className="faint" style={{ fontSize: "0.8125rem" }}>
                    {decodeStringList(a.tags).join(" · ")}
                    {a.author ? ` · ${a.author}` : ""} · updated {ago(a.updatedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        {can(user.role, "knowledge:write") && (
          <section className="panel" aria-labelledby="new-article">
            <h2 id="new-article">Write an article</h2>
            <ActionForm action={createArticleAction} submit="Publish internally">
              <label className="field">
                <span className="label-text">Title</span>
                <input className="input" name="title" required maxLength={200} />
              </label>
              <label className="field">
                <span className="label-text">Content</span>
                <textarea className="input" name="content" rows={10} required />
              </label>
              <label className="field">
                <span className="label-text">Tags</span>
                <input className="input" name="tags" placeholder="comma, separated" />
              </label>
            </ActionForm>
          </section>
        )}
      </div>
    </>
  );
}
