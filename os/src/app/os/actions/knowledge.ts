"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/web/session";
import { errorState, type ActionState } from "@/lib/web/actionState";
import { str } from "@/lib/web/form";
import { linesToList } from "@/lib/proposals/model";
import { createArticle, updateArticle } from "@/lib/knowledge/service";
import { createAsset, recordAssetUse, updateAsset, type AssetInput } from "@/lib/library/assets";
import { POSTMORTEM_QUESTIONS, savePostMortem, type PostMortemInput } from "@/lib/projects/postmortem";
import { updateSupportRequest } from "@/lib/portal/service";

const tagsOf = (form: FormData) => str(form, "tags").split(",").map((t) => t.trim()).filter(Boolean);

export async function createArticleAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  let id: string;
  try {
    id = (await createArticle(actor, { title: str(form, "title"), content: str(form, "content"), tags: tagsOf(form) })).id;
  } catch (err) {
    return errorState(err);
  }
  redirect(`/os/knowledge/${id}`);
}

export async function updateArticleAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const id = str(form, "id");
  try {
    await updateArticle(actor, id, { title: str(form, "title"), content: str(form, "content"), tags: tagsOf(form) });
    revalidatePath(`/os/knowledge/${id}`);
    return { ok: "Saved." };
  } catch (err) {
    return errorState(err);
  }
}

function assetInput(form: FormData): AssetInput {
  return {
    name: str(form, "name"),
    category: str(form, "category"),
    version: str(form, "version"),
    description: str(form, "description"),
    dependencies: linesToList(str(form, "dependencies"), 30),
    usage: str(form, "usage"),
    owner: str(form, "owner"),
    docsUrl: str(form, "docsUrl"),
    repoUrl: str(form, "repoUrl"),
  };
}

export async function saveAssetAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const id = str(form, "id");
    const a = id ? await updateAsset(actor, id, assetInput(form)) : await createAsset(actor, assetInput(form));
    revalidatePath("/os/library");
    return { ok: `${id ? "Updated" : "Added"} ${a.code}.` };
  } catch (err) {
    return errorState(err);
  }
}

export async function recordAssetUseAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const projectId = str(form, "projectId");
  try {
    const r = await recordAssetUse(actor, str(form, "assetCode"), projectId, str(form, "note"));
    revalidatePath(`/os/projects/${projectId}`);
    revalidatePath("/os/library");
    return { ok: `${r.asset.code} recorded: used on ${r.uses} project(s), now ${r.maturity.toLowerCase().replace("_", " ")}.` };
  } catch (err) {
    return errorState(err);
  }
}

export async function postMortemAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const projectId = str(form, "projectId");
  try {
    const input = Object.fromEntries(POSTMORTEM_QUESTIONS.map(([k]) => [k, str(form, k)])) as PostMortemInput;
    await savePostMortem(actor, projectId, input);
    revalidatePath(`/os/projects/${projectId}`);
    return { ok: "Post-mortem saved. Its lessons are in the knowledge base." };
  } catch (err) {
    return errorState(err);
  }
}

export async function supportAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const sr = await updateSupportRequest(actor, str(form, "id"), { status: str(form, "status"), response: str(form, "response") });
    revalidatePath("/os/support");
    return { ok: `${sr.code} is ${sr.status.toLowerCase().replace("_", " ")}.` };
  } catch (err) {
    return errorState(err);
  }
}
