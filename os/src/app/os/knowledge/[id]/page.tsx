import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/web/session";
import { decodeStringList } from "@/lib/db/json";
import { ActionForm } from "../../../_components/ActionForm";
import { NoAccess, PageHead, when } from "../../../_components/ui";
import { updateArticleAction } from "../../actions/knowledge";

export const metadata: Metadata = { title: "Article" };

export default async function ArticlePage({ params }: PageProps<"/os/knowledge/[id]">) {
  const user = await requireUser();
  if (!can(user.role, "knowledge:read")) return <NoAccess capability="knowledge:read" />;
  const a = await prisma.knowledge.findUnique({ where: { id: (await params).id } });
  if (!a) notFound();
  const tags = decodeStringList(a.tags);
  return (
    <>
      <PageHead title={a.title} eyebrow={a.source === "POST_MORTEM" ? "Post-mortem lessons" : "Knowledge"} crumbs={[{ href: "/os/knowledge", label: "Knowledge" }]} />
      <div className="split">
        <article className="panel">
          <p className="faint" style={{ fontSize: "0.8125rem" }}>
            {a.author ?? "—"} · updated {when(a.updatedAt)} {tags.length > 0 && `· ${tags.join(" · ")}`}
          </p>
          <div className="prewrap">{a.content}</div>
        </article>
        {can(user.role, "knowledge:write") && (
          <section className="panel" aria-labelledby="edit">
            <h2 id="edit">Edit</h2>
            {a.source === "POST_MORTEM" && <p className="notice info">Generated from a post-mortem. Editing the post-mortem regenerates it.</p>}
            <ActionForm action={updateArticleAction} submit="Save">
              <input type="hidden" name="id" value={a.id} />
              <input className="input" name="title" defaultValue={a.title} aria-label="Title" required />
              <textarea className="input" name="content" defaultValue={a.content} rows={14} aria-label="Content" required />
              <input className="input" name="tags" defaultValue={tags.join(", ")} aria-label="Tags" />
            </ActionForm>
          </section>
        )}
      </div>
    </>
  );
}
