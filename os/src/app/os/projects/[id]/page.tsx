import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/web/session";
import { APPROVAL_GATES, PROJECT_STAGES, TEST_LEVELS } from "@/lib/db/enums";
import { traceMatrix } from "@/lib/trace/service";
import { gateLeaving } from "@/lib/projects/service";
import { clientProgress, nextStage } from "@/lib/projects/progress";
import { approvedScopeFor } from "@/lib/proposals/service";
import { formatInr } from "@/lib/proposals/model";
import { ActionForm } from "../../../_components/ActionForm";
import { FactoryPanel } from "../../../_components/FactoryPanel";
import { MoneyPanel } from "../../../_components/MoneyPanel";
import { ProjectKnowledgePanel } from "../../../_components/ProjectKnowledgePanel";
import { projectEconomics } from "@/lib/finance/costs";
import { SERVICE_TYPES } from "@/lib/db/enums";
import { projectAiSpend, runnableTasks } from "@/lib/factory/orchestrate";
import { Badge, NoAccess, PageHead, ago, when } from "../../../_components/ui";
import {
  addFeatureAction,
  addTaskAction,
  addTestAction,
  assessChangeAction,
  convertChangeAction,
  createChangeAction,
  decideChangeAction,
  deploymentAction,
  evidenceAction,
  linkAction,
  moveStageAction,
  requestGateAction,
  statusLinkAction,
} from "../../actions/projects";
import { serviceTypeAction } from "../../actions/finance";

export async function generateMetadata({ params }: PageProps<"/os/projects/[id]">): Promise<Metadata> {
  const p = await prisma.project.findUnique({ where: { id: (await params).id }, select: { code: true, name: true } });
  return { title: p?.code ?? p?.name ?? "Project" };
}

export default async function ProjectPage({ params }: PageProps<"/os/projects/[id]">) {
  const user = await requireUser();
  if (!can(user.role, "project:read")) return <NoAccess capability="project:read" />;
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      client: true,
      proposal: { select: { id: true, code: true, priceTotal: true } },
      tasks: { orderBy: { createdAt: "asc" } },
      artifacts: { orderBy: { createdAt: "asc" } },
      approvals: { orderBy: { createdAt: "desc" } },
      features: { orderBy: { code: "asc" } },
      testCases: { orderBy: { code: "asc" }, include: { evidence: { orderBy: { recordedAt: "desc" }, take: 1 } } },
      changeRequests: { orderBy: { createdAt: "desc" } },
      deployments: { orderBy: { deployedAt: "desc" } },
      events: { orderBy: { timestamp: "desc" }, take: 25 },
      agentRuns: { orderBy: { createdAt: "desc" } },
      invoices: { orderBy: { createdAt: "asc" }, include: { payments: true } },
      costEntries: { orderBy: { incurredOn: "desc" } },
      postMortem: true,
      assetUses: { include: { asset: { select: { code: true, name: true, maturity: true } } } },
    },
  });
  if (!project) notFound();

  const canFinance = can(user.role, "finance:read");
  const [matrix, scope, spend, runnable, economics] = await Promise.all([
    traceMatrix(id),
    approvedScopeFor(id),
    projectAiSpend(id),
    runnableTasks(id),
    canFinance ? projectEconomics(id) : Promise.resolve(null),
  ]);
  const write = can(user.role, "project:write");
  const traceWrite = can(user.role, "trace:write");
  const gate = gateLeaving(project.stage);
  const to = nextStage(project.stage);
  const progress = clientProgress(project.stage);
  const stageIndex = PROJECT_STAGES.indexOf(project.stage as (typeof PROJECT_STAGES)[number]);
  const pendingGates = project.approvals.filter((a) => a.status === "PENDING");
  const untested = matrix.filter((r) => r.tests.length === 0).length;

  return (
    <>
      <PageHead title={project.name} eyebrow={project.code ?? "Project"} crumbs={[{ href: "/os/projects", label: "Projects" }]}>
        <span className="badge info">{project.stage.replace("_", " ").toLowerCase()}</span>
      </PageHead>

      <section className="panel" aria-labelledby="lifecycle">
        <div className="panel-head">
          <h2 id="lifecycle">Lifecycle</h2>
          <span className="label">client sees: {progress.percent}% · {progress.milestone}</span>
        </div>
        <div className="stages" aria-label="Project stages">
          {PROJECT_STAGES.map((s, i) => (
            <span key={s} className={i < stageIndex ? "done" : i === stageIndex ? "current" : ""}>
              {s.replace("_", " ").toLowerCase()}
            </span>
          ))}
        </div>
        {write && to && (
          <div className="row" style={{ alignItems: "start" }}>
            <ActionForm action={moveStageAction} submit={`Move to ${to.replace("_", " ").toLowerCase()}`} variant="ghost sm" className="">
              <input type="hidden" name="projectId" value={project.id} />
              {gate && <p className="faint" style={{ fontSize: "0.8125rem" }}>Needs an approved {gate} gate.</p>}
            </ActionForm>
            <ActionForm action={requestGateAction} submit="Request gate" variant="ghost sm" className="">
              <input type="hidden" name="projectId" value={project.id} />
              <select className="input" name="gate" aria-label="Gate" defaultValue={gate ?? "REQUIREMENTS"}>
                {APPROVAL_GATES.map((g) => (
                  <option key={g} value={g}>
                    {g.toLowerCase()}
                  </option>
                ))}
              </select>
            </ActionForm>
          </div>
        )}
        {pendingGates.length > 0 && (
          <p className="notice warn">
            Waiting for a decision: {pendingGates.map((a) => a.gate).join(", ")}.{" "}
            {can(user.role, "approval:decide") && <Link href="/os/approvals">Decide in Approvals</Link>}
          </p>
        )}
      </section>

      {(can(user.role, "factory:run") || can(user.role, "factory:review")) && (
        <FactoryPanel
          projectId={project.id}
          runs={project.agentRuns}
          budgetUsd={project.aiBudgetUsd}
          spend={spend}
          runnable={runnable.length}
          hasCiToken={!!project.ciTokenHash}
          can={{ run: can(user.role, "factory:run"), review: can(user.role, "factory:review"), write }}
        />
      )}

      {economics && (
        <MoneyPanel projectId={project.id} e={economics} invoices={project.invoices} costs={project.costEntries} canWrite={can(user.role, "finance:write")} />
      )}

      <ProjectKnowledgePanel
        projectId={project.id}
        postMortem={project.postMortem}
        uses={project.assetUses}
        canWrite={write}
        canIp={can(user.role, "ip:write")}
      />

      <div className="split">
        <div className="stack">
          <section className="panel" aria-labelledby="trace">
            <div className="panel-head">
              <h2 id="trace">Requirements & evidence</h2>
              <span className="label">
                {matrix.length} requirements · {untested} without a test
              </span>
            </div>
            {matrix.length === 0 ? (
              <p className="empty">No requirements are attached to this project.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Requirement</th>
                      <th>Built by</th>
                      <th>Proven by</th>
                      <th>Shipped</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.map((r) => (
                      <tr key={r.code}>
                        <td style={{ minWidth: "16rem" }}>
                          <span className="code">{r.code}</span> <span className="faint">{r.priority.toLowerCase()}</span>
                          <div>{r.statement}</div>
                          {r.gaps.length > 0 ? (
                            <ul className="faint" style={{ paddingLeft: "1rem", fontSize: "0.75rem", color: "var(--warn)" }}>
                              {r.gaps.map((g) => (
                                <li key={g}>{g}</li>
                              ))}
                            </ul>
                          ) : (
                            <Badge value="traced and proven" tone="good" />
                          )}
                        </td>
                        <td className="code">
                          {r.features.join(", ") || "—"}
                          {r.tasks.length > 0 && <div className="faint">{r.tasks.join(", ")}</div>}
                        </td>
                        <td>
                          {r.tests.length === 0
                            ? "—"
                            : r.tests.map((t) => (
                                <div key={t.code} className="row" style={{ gap: "0.35rem" }}>
                                  <span className="code">{t.code}</span>
                                  {t.latest ? <Badge value={`${t.latest.passed}/${t.latest.total}`} tone={t.latest.result === "PASS" ? "good" : "bad"} /> : <span className="faint">no evidence</span>}
                                </div>
                              ))}
                        </td>
                        <td className="code">{r.deployments.join(", ") || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {traceWrite && (
              <div className="grid-2">
                <details className="disclose">
                  <summary>Add a feature</summary>
                  <ActionForm action={addFeatureAction} submit="Add feature" variant="sm">
                    <input type="hidden" name="projectId" value={project.id} />
                    <input className="input" name="title" placeholder="Invoice export" aria-label="Feature name" required />
                    <input className="input" name="requirementCode" placeholder="Satisfies (e.g. REQ-104), optional" aria-label="Requirement code" />
                  </ActionForm>
                </details>
                <details className="disclose">
                  <summary>Add a task</summary>
                  <ActionForm action={addTaskAction} submit="Add task" variant="sm">
                    <input type="hidden" name="projectId" value={project.id} />
                    <input className="input" name="title" placeholder="InvoiceExportService" aria-label="Task title" required />
                    <input className="input" name="featureCode" placeholder="Implements (e.g. FEAT-027), optional" aria-label="Feature code" />
                  </ActionForm>
                </details>
                <details className="disclose">
                  <summary>Add a test</summary>
                  <ActionForm action={addTestAction} submit="Add test" variant="sm">
                    <input type="hidden" name="projectId" value={project.id} />
                    <input className="input" name="title" placeholder="Export totals match the invoice" aria-label="Test" required />
                    <select className="input" name="level" aria-label="Level" defaultValue="UNIT">
                      {TEST_LEVELS.map((l) => (
                        <option key={l} value={l}>
                          {l.toLowerCase()}
                        </option>
                      ))}
                    </select>
                    <input className="input" name="verifiesCode" placeholder="Verifies (REQ-, FEAT- or TASK-), optional" aria-label="Verifies" />
                  </ActionForm>
                </details>
                <details className="disclose">
                  <summary>Link two items</summary>
                  <ActionForm action={linkAction} submit="Link" variant="sm">
                    <input type="hidden" name="projectId" value={project.id} />
                    <div className="form-row">
                      <input className="input" name="from" placeholder="From (FEAT-027)" aria-label="From" required />
                      <input className="input" name="to" placeholder="To (TASK-088)" aria-label="To" required />
                    </div>
                    <span className="hint faint">REQ → FEAT → TASK → TEST → DEPLOY. The relation is worked out from the codes.</span>
                  </ActionForm>
                </details>
              </div>
            )}
          </section>

          <section className="panel" aria-labelledby="tests">
            <div className="panel-head">
              <h2 id="tests">Tests and evidence</h2>
              <span className="label">{project.testCases.length}</span>
            </div>
            {project.testCases.length === 0 ? (
              <p className="empty">No tests yet. &ldquo;Implemented&rdquo; means nothing until a test proves it.</p>
            ) : (
              <ul className="list" role="list">
                {project.testCases.map((t) => {
                  const ev = t.evidence[0];
                  return (
                    <li key={t.id}>
                      <div className="item-head">
                        <span>
                          <span className="code mono">{t.code}</span> {t.title} <span className="faint">({t.level.toLowerCase()})</span>
                        </span>
                        {ev ? <Badge value={`${ev.result} ${ev.passed}/${ev.total}`} tone={ev.result === "PASS" ? "good" : "bad"} /> : <Badge value="no evidence" tone="warn" />}
                      </div>
                      {ev && (
                        <span className="faint" style={{ fontSize: "0.8125rem" }}>
                          {ev.summary} · {ev.recordedBy} · {ago(ev.recordedAt)}
                          {ev.link && (
                            <>
                              {" · "}
                              <a href={ev.link} rel="noopener noreferrer" target="_blank">
                                report
                              </a>
                            </>
                          )}
                        </span>
                      )}
                      {can(user.role, "evidence:write") && (
                        <details className="disclose">
                          <summary>Record a run</summary>
                          <ActionForm action={evidenceAction} submit="Record evidence" variant="sm">
                            <input type="hidden" name="projectId" value={project.id} />
                            <input type="hidden" name="testCaseId" value={t.id} />
                            <div className="form-row">
                              <input className="input" name="passed" inputMode="numeric" placeholder="Passed" aria-label="Passed" required />
                              <input className="input" name="total" inputMode="numeric" placeholder="Total" aria-label="Total" required />
                            </div>
                            <input className="input" name="summary" placeholder="What ran, e.g. CI run #412, unit suite" aria-label="Summary" required />
                            <input className="input" name="link" placeholder="Link to the run or report (optional)" aria-label="Link" />
                          </ActionForm>
                        </details>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="panel" aria-labelledby="changes">
            <div className="panel-head">
              <h2 id="changes">Change requests</h2>
              <span className="label">{project.changeRequests.length}</span>
            </div>
            {scope.length > 0 && (
              <details className="disclose">
                <summary>Approved scope ({scope.length} items)</summary>
                <ul style={{ paddingLeft: "1.1rem" }}>
                  {scope.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </details>
            )}
            <ul className="list" role="list">
              {project.changeRequests.map((cr) => (
                <li key={cr.id}>
                  <div className="item-head">
                    <span>
                      <span className="code mono">{cr.code}</span> {cr.description}
                    </span>
                    <span className="row">
                      {cr.inScope !== null && <Badge value={cr.inScope ? "in scope" : "out of scope"} tone={cr.inScope ? "good" : "warn"} />}
                      <Badge value={cr.status} />
                    </span>
                  </div>
                  <span className="faint" style={{ fontSize: "0.8125rem" }}>
                    Requested by {cr.requestedBy}, {when(cr.createdAt)}
                    {cr.impact && ` · ${cr.impact}`}
                    {cr.inScope === false && ` · +${formatInr(cr.costDelta)}, +${cr.timelineDelta} days`}
                    {cr.decidedBy && ` · decided by ${cr.decidedBy}`}
                  </span>
                  {can(user.role, "change:write") && ["OPEN", "ASSESSED"].includes(cr.status) && (
                    <details className="disclose">
                      <summary>{cr.status === "OPEN" ? "Assess against scope" : "Re-assess"}</summary>
                      <ActionForm action={assessChangeAction} submit="Save assessment" variant="sm">
                        <input type="hidden" name="projectId" value={project.id} />
                        <input type="hidden" name="changeId" value={cr.id} />
                        <label className="check">
                          <input type="checkbox" name="inScope" defaultChecked={cr.inScope ?? false} /> Inside the approved scope
                        </label>
                        <textarea className="input" name="impact" defaultValue={cr.impact ?? ""} rows={2} placeholder="Impact on design, code, testing, timeline" aria-label="Impact" required />
                        <div className="form-row">
                          <input className="input" name="costDelta" inputMode="numeric" defaultValue={cr.costDelta || ""} placeholder="Additional cost ₹ (out of scope)" aria-label="Additional cost" />
                          <input className="input" name="timelineDelta" inputMode="numeric" defaultValue={cr.timelineDelta || ""} placeholder="Additional days (out of scope)" aria-label="Additional days" />
                        </div>
                      </ActionForm>
                    </details>
                  )}
                  {cr.status === "ASSESSED" && cr.inScope === true && can(user.role, "change:write") && (
                    <ActionForm action={convertChangeAction} submit="Add to backlog" variant="ghost sm" className="">
                      <input type="hidden" name="projectId" value={project.id} />
                      <input type="hidden" name="changeId" value={cr.id} />
                    </ActionForm>
                  )}
                  {cr.status === "ASSESSED" && cr.inScope === false && can(user.role, "change:decide") && (
                    <div className="row">
                      <ActionForm action={decideChangeAction} submit={`Approve +${formatInr(cr.costDelta)}`} variant="sm" className="" confirm="The client agreed to the cost and timeline in writing">
                        <input type="hidden" name="projectId" value={project.id} />
                        <input type="hidden" name="changeId" value={cr.id} />
                        <input type="hidden" name="decision" value="APPROVED" />
                      </ActionForm>
                      <ActionForm action={decideChangeAction} submit="Reject" variant="danger sm" className="">
                        <input type="hidden" name="projectId" value={project.id} />
                        <input type="hidden" name="changeId" value={cr.id} />
                        <input type="hidden" name="decision" value="REJECTED" />
                      </ActionForm>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {can(user.role, "change:write") && (
              <details className="disclose">
                <summary>Log a change request</summary>
                <ActionForm action={createChangeAction} submit="Log request" variant="sm">
                  <input type="hidden" name="projectId" value={project.id} />
                  <input className="input" name="requestedBy" placeholder="Who asked" aria-label="Requested by" required />
                  <textarea className="input" name="description" rows={3} placeholder="Can you also add…" aria-label="Description" required />
                </ActionForm>
              </details>
            )}
          </section>
        </div>

        <div className="stack">
          <section className="panel" aria-labelledby="overview">
            <h2 id="overview">Overview</h2>
            <dl className="dl">
              <dt>Client</dt>
              <dd>{project.client?.name ?? "—"}</dd>
              {project.client?.email && (
                <>
                  <dt>Email</dt>
                  <dd>{project.client.email}</dd>
                </>
              )}
              {project.proposal && (
                <>
                  <dt>Proposal</dt>
                  <dd>
                    <Link href={`/os/proposals/${project.proposal.id}`}>{project.proposal.code}</Link>
                  </dd>
                  {can(user.role, "economics:read") && (
                    <>
                      <dt>Contract</dt>
                      <dd className="num">{formatInr(project.proposal.priceTotal)}</dd>
                    </>
                  )}
                </>
              )}
              <dt>Artifacts</dt>
              <dd>
                <code>/projects/{project.artifactsPath}/</code>
              </dd>
            </dl>
            {write && (
              <ActionForm action={serviceTypeAction} submit="Save" variant="ghost sm" className="row">
                <input type="hidden" name="projectId" value={project.id} />
                <select className="input" name="serviceType" defaultValue={project.serviceType ?? ""} aria-label="Service type" style={{ maxWidth: "12rem" }}>
                  <option value="">Service type…</option>
                  {SERVICE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.replace("_", " ").toLowerCase()}
                    </option>
                  ))}
                </select>
              </ActionForm>
            )}
            {write && (
              <ActionForm action={statusLinkAction} submit="New client status link" variant="ghost sm">
                <input type="hidden" name="projectId" value={project.id} />
              </ActionForm>
            )}
          </section>

          <section className="panel" aria-labelledby="deploys">
            <h2 id="deploys">Deployments</h2>
            {project.deployments.length === 0 ? (
              <p className="empty">None recorded.</p>
            ) : (
              <ul className="list" role="list">
                {project.deployments.map((d) => (
                  <li key={d.id} className="item-head">
                    <span>
                      <span className="code mono">{d.code ?? "—"}</span> {d.environment}
                    </span>
                    <span className="row">
                      <Badge value={d.status} />
                      <span className="faint">{when(d.deployedAt)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {write && (
              <details className="disclose">
                <summary>Record a deployment</summary>
                <ActionForm action={deploymentAction} submit="Record" variant="sm">
                  <input type="hidden" name="projectId" value={project.id} />
                  <div className="form-row">
                    <select className="input" name="environment" aria-label="Environment" defaultValue="staging">
                      <option value="preview">preview</option>
                      <option value="staging">staging</option>
                      <option value="production">production (needs PRODUCTION gate)</option>
                    </select>
                    <select className="input" name="outcome" aria-label="Outcome" defaultValue="SUCCEEDED">
                      <option value="SUCCEEDED">succeeded</option>
                      <option value="FAILED">failed</option>
                    </select>
                  </div>
                  <textarea className="input" name="rollbackPlan" rows={2} placeholder="Rollback plan (required for production)" aria-label="Rollback plan" />
                </ActionForm>
              </details>
            )}
          </section>

          <section className="panel" aria-labelledby="tasks">
            <h2 id="tasks">Tasks</h2>
            {project.tasks.length === 0 ? (
              <p className="empty">No tasks yet.</p>
            ) : (
              <ul className="list" role="list">
                {project.tasks.map((t) => (
                  <li key={t.id} className="item-head">
                    <span>
                      {t.code && <span className="code mono">{t.code} </span>}
                      {t.title}
                      {t.ownerAgent && <span className="faint"> · {t.ownerAgent}</span>}
                    </span>
                    <Badge value={t.status} tone={t.status === "BLOCKED" ? "bad" : t.status === "DONE" ? "good" : ""} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {project.artifacts.length > 0 && (
            <section className="panel" aria-labelledby="artifacts">
              <h2 id="artifacts">Agent artifacts</h2>
              <ul className="list" role="list">
                {project.artifacts.map((a) => (
                  <li key={a.id}>
                    <span>
                      <b>{a.type}</b> v{a.version}
                    </span>
                    <code className="faint">{a.filePath}</code>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="panel" aria-labelledby="activity">
            <h2 id="activity">Activity</h2>
            <ul className="list" role="list">
              {project.events.map((e) => (
                <li key={e.id}>
                  <span className="faint label">
                    {e.agentSlug ?? "team"} · {ago(e.timestamp)}
                  </span>
                  <span style={{ fontSize: "0.875rem" }}>{e.message}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
