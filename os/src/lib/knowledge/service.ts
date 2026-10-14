import { prisma } from "../db/client";
import { audit } from "../audit";
import { assertCan } from "../auth/permissions";
import type { Actor } from "../auth/actor";
import { encodeStringList } from "../db/json";

/**
 * The internal knowledge base: standards, lessons, how-tos. Post-mortems
 * write into it automatically (source POST_MORTEM) so each project teaches
 * the next one. Internal only; nothing here is shown to clients.
 */
export interface ArticleInput {
  title: string;
  content: string;
  tags: string[];
}

function validate(input: ArticleInput) {
  const title = input.title.trim();
  const content = input.content.trim();
  if (title.length < 3) throw new Error("Give it a title.");
  if (title.length > 200) throw new Error("Keep the title under 200 characters.");
  if (content.length < 10) throw new Error("Write the article.");
  if (content.length > 50_000) throw new Error("Keep an article under 50,000 characters; split it up.");
  const tags = [...new Set(input.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 12);
  return { title, content, tags: encodeStringList(tags) };
}

export async function createArticle(actor: Actor, input: ArticleInput) {
  assertCan(actor.role, "knowledge:write");
  const a = await prisma.knowledge.create({ data: { ...validate(input), scope: "GLOBAL", source: "MANUAL", author: actor.label } });
  await audit(actor, "knowledge.created", "Knowledge", a.id, a.title);
  return a;
}

export async function updateArticle(actor: Actor, id: string, input: ArticleInput) {
  assertCan(actor.role, "knowledge:write");
  const a = await prisma.knowledge.update({ where: { id }, data: validate(input) });
  await audit(actor, "knowledge.updated", "Knowledge", id, a.title);
  return a;
}

/** Case-insensitive search across title, content and tags (SQLite LIKE is case-insensitive for ASCII). */
export async function searchArticles(query: string, take = 100) {
  const q = query.trim();
  return prisma.knowledge.findMany({
    where: q ? { OR: [{ title: { contains: q } }, { content: { contains: q } }, { tags: { contains: q.toLowerCase() } }] } : {},
    orderBy: { updatedAt: "desc" },
    take,
  });
}
