import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/web/session";
import { GATE_TRANSITIONS } from "@/lib/orchestrator/qualityGates";
import type { ApprovalGate } from "@/lib/db/enums";
import { ActionForm } from "../../_components/ActionForm";
import { Badge, NoAccess, PageHead, ago, when } from "../../_components/ui";
import { decideGateAction } from "../actions/projects";

export const metadata: Metadata = { title: "Approvals" };

/** What a person is agreeing to when they approve each gate (architecture-plan Section H + Phase 1 gates). */
const GATE_CHECKLIST: Record<ApprovalGate, string> = {
  PROPOSAL: "The client accepted scope, price and payment schedule.",
  REQUIREMENTS: "Clear problem, target users, scope, acceptance criteria and assumptions.",
  PLAN: "Implementation plan: features, tasks, owners, milestones and risks.",
  DESIGN: "UX flow, responsive behaviour, component system and accessibility requirements.",
  ARCHITECTURE: "Architecture, data model, API design, security and deployment strategy. The simplest design that works.",
  IMPLEMENTATION: "Tests, error handling, documentation and code review.",
  QA: "Functional, responsive, accessibility and regression testing, with evidence.",
  PRODUCTION: "Security review, deployment plan, monitoring, rollback plan and backups where relevant.",
  HANDOVER: "Client has accepted delivery; documentation and access are handed over.",
};

export default async function ApprovalsPage() {
  const user = await requireUser();
  if (!can(user.role, "approval:decide")) return <NoAccess capability="approval:decide" />;
  const [pending, decided] = await Promise.all([
    prisma.approval.findMany({ where: { status: "PENDING" }, include: { project: true }, orderBy: { createdAt: "asc" } }),
    prisma.approval.findMany({ where: { status: { not: "PENDING" } }, include: { project: true }, orderBy: { decidedAt: "desc" }, take: 30 }),
  ]);

  return (
    <>
      <PageHead title="Approvals" eyebrow="Human gates" />
      <p className="muted">
        Agents and the team propose; a person decides. Approving the gate that is currently blocking a project moves it to the next stage.
      </p>
      <section className="stack" aria-labelledby="pending">
        <h2 id="pending">Waiting on you ({pending.length})</h2>
        {pending.length === 0 && <p className="empty">Nothing is waiting on you.</p>}
        {pending.map((a) => {
          const gate = a.gate as ApprovalGate;
          const t = GATE_TRANSITIONS[gate];
          return (
            <article key={a.id} className="panel">
              <div className="panel-head">
                <h3>
                  {gate} gate · <Link href={`/os/projects/${a.projectId}`}>{a.project.name}</Link>
                </h3>
                <span className="faint">
                  requested by {a.requestedBy}, {ago(a.createdAt)}
                </span>
              </div>
              {t && (
                <p className="faint">
                  {t.from.replace("_", " ").toLowerCase()} → {t.to.replace("_", " ").toLowerCase()}
                </p>
              )}
              <p>
                <b>Approve only if:</b> {GATE_CHECKLIST[gate] ?? "the stage's exit criteria are met."}
              </p>
              <div className="row">
                <ActionForm action={decideGateAction} submit="Approve" className="">
                  <input type="hidden" name="approvalId" value={a.id} />
                  <input type="hidden" name="decision" value="APPROVED" />
                </ActionForm>
                <ActionForm action={decideGateAction} submit="Reject" variant="danger" className="">
                  <input type="hidden" name="approvalId" value={a.id} />
                  <input type="hidden" name="decision" value="REJECTED" />
                </ActionForm>
              </div>
            </article>
          );
        })}
      </section>

      <section className="panel" aria-labelledby="decided">
        <h2 id="decided">Recent decisions</h2>
        {decided.length === 0 ? (
          <p className="empty">No decisions yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Gate</th>
                  <th>Project</th>
                  <th>Decision</th>
                  <th>By</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {decided.map((a) => (
                  <tr key={a.id}>
                    <td className="code">{a.gate}</td>
                    <td>
                      <Link href={`/os/projects/${a.projectId}`}>{a.project.name}</Link>
                    </td>
                    <td>
                      <Badge value={a.status} />
                    </td>
                    <td>{a.decidedBy}</td>
                    <td className="faint">{when(a.decidedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
