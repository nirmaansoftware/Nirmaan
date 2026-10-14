import type { Asset, AssetUse, PostMortem } from "@prisma/client";
import { POSTMORTEM_QUESTIONS } from "@/lib/projects/postmortem";
import { ActionForm } from "./ActionForm";
import { when } from "./ui";
import { postMortemAction, recordAssetUseAction } from "../os/actions/knowledge";

/** Project-level knowledge: the post-mortem (required before handover) and reusable assets used. */
export function ProjectKnowledgePanel({
  projectId,
  postMortem,
  uses,
  canWrite,
  canIp,
}: {
  projectId: string;
  postMortem: PostMortem | null;
  uses: (AssetUse & { asset: Pick<Asset, "code" | "name" | "maturity"> })[];
  canWrite: boolean;
  canIp: boolean;
}) {
  return (
    <section className="panel" aria-labelledby="learning">
      <div className="panel-head">
        <h2 id="learning">Learning & reuse</h2>
        <span className="label">{postMortem ? `post-mortem ${when(postMortem.createdAt)}` : "no post-mortem yet"}</span>
      </div>
      <div className="grid-2">
        <div className="stack">
          <h3>Post-mortem</h3>
          <p className="faint" style={{ fontSize: "0.8125rem" }}>
            Required before the HANDOVER gate can be approved. Its lessons go to the knowledge base, with an estimate-vs-actual snapshot.
          </p>
          {canWrite ? (
            <details className="disclose" open={!!postMortem}>
              <summary>{postMortem ? "Edit post-mortem" : "Write the post-mortem"}</summary>
              <ActionForm action={postMortemAction} submit="Save post-mortem" variant="sm">
                <input type="hidden" name="projectId" value={projectId} />
                {POSTMORTEM_QUESTIONS.map(([key, question]) => (
                  <label key={key} className="field">
                    <span className="label-text">{question}</span>
                    <textarea className="input" name={key} rows={2} defaultValue={postMortem?.[key] ?? ""} />
                  </label>
                ))}
              </ActionForm>
            </details>
          ) : (
            postMortem && (
              <dl className="dl" style={{ fontSize: "0.8125rem" }}>
                {POSTMORTEM_QUESTIONS.map(([k, q]) => (
                  <div key={k} style={{ display: "contents" }}>
                    <dt>{q}</dt>
                    <dd>{postMortem[k] || "—"}</dd>
                  </div>
                ))}
              </dl>
            )
          )}
        </div>
        <div className="stack">
          <h3>Reusable assets used</h3>
          {uses.length === 0 ? (
            <p className="empty">None recorded.</p>
          ) : (
            <ul className="list" role="list">
              {uses.map((u) => (
                <li key={u.id} className="item-head" style={{ fontSize: "0.875rem" }}>
                  <span>
                    <span className="mono">{u.asset.code}</span> {u.asset.name}
                    {u.note && <span className="faint"> · {u.note}</span>}
                  </span>
                  <span className="badge">{u.asset.maturity.toLowerCase().replace("_", " ")}</span>
                </li>
              ))}
            </ul>
          )}
          {canIp && (
            <ActionForm action={recordAssetUseAction} submit="Record use" variant="ghost sm" className="row">
              <input type="hidden" name="projectId" value={projectId} />
              <input className="input" name="assetCode" placeholder="IP-004" aria-label="Asset code" required style={{ maxWidth: "8rem" }} />
              <input className="input" name="note" placeholder="How it was used (optional)" aria-label="Note" />
            </ActionForm>
          )}
        </div>
      </div>
    </section>
  );
}
