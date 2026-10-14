import { prisma } from "@/lib/db/client";
import { nextCode } from "@/lib/ids";
import { audit } from "@/lib/audit";
import { assertCan } from "@/lib/auth/permissions";
import type { Actor } from "@/lib/auth/actor";
import { encodeStringList } from "@/lib/db/json";
import { ASSET_CATEGORIES, PROVEN_AFTER_PROJECTS, isOneOf, type AssetMaturity } from "@/lib/db/enums";

/**
 * The reusable IP library: "build once, reuse many times". Assets are
 * harvested from delivered work, never built speculatively, and maturity is
 * earned rather than declared: EXPERIMENTAL → USED_ONCE (first project) →
 * PROVEN (three projects), updated automatically as uses are recorded.
 */
export interface AssetInput {
  name: string;
  category: string;
  version: string;
  description: string;
  dependencies: string[];
  usage: string;
  owner: string;
  docsUrl?: string;
  repoUrl?: string;
}

const SEMVER = /^\d+\.\d+\.\d+$/;
const URL = /^https?:\/\//;

function validate(input: AssetInput) {
  const name = input.name.trim();
  if (name.length < 3) throw new Error("Give the asset a name.");
  if (!isOneOf(ASSET_CATEGORIES, input.category)) throw new Error("Choose a category.");
  if (!SEMVER.test(input.version.trim())) throw new Error("Version must look like 1.2.0.");
  if (input.description.trim().length < 10) throw new Error("Describe what it does and when to use it.");
  if (!input.usage.trim()) throw new Error("Explain how to use it.");
  if (!input.owner.trim()) throw new Error("Name an owner, the person who keeps it working.");
  for (const u of [input.docsUrl, input.repoUrl]) if (u && !URL.test(u)) throw new Error("Links must start with http:// or https://.");
  return {
    name,
    category: input.category,
    version: input.version.trim(),
    description: input.description.trim(),
    dependencies: encodeStringList(input.dependencies.map((d) => d.trim()).filter(Boolean).slice(0, 30)),
    usage: input.usage.trim(),
    owner: input.owner.trim(),
    docsUrl: input.docsUrl?.trim() || null,
    repoUrl: input.repoUrl?.trim() || null,
  };
}

export async function createAsset(actor: Actor, input: AssetInput) {
  assertCan(actor.role, "ip:write");
  const data = validate(input);
  const asset = await prisma.$transaction(async (tx) => tx.asset.create({ data: { ...data, code: await nextCode("IP", tx) } }));
  await audit(actor, "ip.created", "Asset", asset.id, `${asset.code} ${asset.name}`);
  return asset;
}

export async function updateAsset(actor: Actor, id: string, input: AssetInput) {
  assertCan(actor.role, "ip:write");
  const data = validate(input);
  const asset = await prisma.asset.update({ where: { id }, data });
  await audit(actor, "ip.updated", "Asset", id, `${asset.code} v${asset.version}`);
  return asset;
}

export function maturityFor(projectCount: number): AssetMaturity {
  if (projectCount >= PROVEN_AFTER_PROJECTS) return "PROVEN";
  return projectCount >= 1 ? "USED_ONCE" : "EXPERIMENTAL";
}

/** Records that a project used an asset (once per project) and updates its maturity. */
export async function recordAssetUse(actor: Actor, assetCode: string, projectId: string, note?: string) {
  assertCan(actor.role, "ip:write");
  const asset = await prisma.asset.findUnique({ where: { code: assetCode.trim().toUpperCase() } });
  if (!asset) throw new Error(`No asset ${assetCode} in the library.`);
  await prisma.assetUse.upsert({
    where: { assetId_projectId: { assetId: asset.id, projectId } },
    create: { assetId: asset.id, projectId, note: note?.trim() || null },
    update: { note: note?.trim() || undefined },
  });
  const count = await prisma.assetUse.count({ where: { assetId: asset.id } });
  const maturity = maturityFor(count);
  if (maturity !== asset.maturity) await prisma.asset.update({ where: { id: asset.id }, data: { maturity } });
  await audit(actor, "ip.used", "Asset", asset.id, `${asset.code} on project ${projectId}`);
  return { asset, uses: count, maturity };
}
