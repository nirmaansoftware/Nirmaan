import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/web/session";
import { OPT_OUT_LINE, whatsappLink } from "@/lib/prospecting/outreach";
import { dailyLimit, sendingConfigured } from "@/lib/prospecting/mailer";
import { workerStatus } from "@/lib/prospecting/worker";
import { ActionForm } from "../../_components/ActionForm";
import { NoAccess, PageHead, ago } from "../../_components/ui";
import { approveAllAction, approveEmailAction, cancelDraftAction, markSentAction, sendEmailAction, updateDraftAction } from "../actions/prospects";

export const metadata: Metadata = { title: "Outreach" };

const stepLabel = (step: number) => (step === 0 ? "first message" : `follow-up ${step}`);

export default async function OutreachPage() {
  const user = await requireUser();
  if (!can(user.role, "prospect:read")) return <NoAccess capability="prospect:read" />;
  const canEdit = can(user.role, "prospect:run");
  const canSend = can(user.role, "outreach:send");
  const include = { prospect: { select: { id: true, code: true, name: true, city: true, category: true, fitScore: true, problem: true } } } as const;
  const startOfDay = new Date(new Date().setHours(0, 0, 0, 0));
  const [emails, whatsapps, queued, sentToday, worker] = await Promise.all([
    prisma.outreachMessage.findMany({ where: { status: "DRAFT", channel: "EMAIL" }, include, orderBy: [{ step: "desc" }, { createdAt: "asc" }], take: 100 }),
    prisma.outreachMessage.findMany({ where: { status: "DRAFT", channel: "WHATSAPP" }, include, orderBy: [{ step: "desc" }, { createdAt: "asc" }], take: 100 }),
    prisma.outreachMessage.findMany({ where: { status: "APPROVED" }, include, orderBy: { scheduledFor: "asc" }, take: 100 }),
    prisma.outreachMessage.groupBy({ by: ["channel"], where: { status: "SENT", sentAt: { gte: startOfDay } }, _count: true }),
    workerStatus(),
  ]);
  const sent = (ch: string) => sentToday.find((s) => s.channel === ch)?._count ?? 0;
  const sending = sendingConfigured();

  return (
    <>
      <PageHead title="Outreach" eyebrow="Pipeline">
        <Link className="btn ghost" href="/os/campaigns">
          Campaigns
        </Link>
      </PageHead>

      <p className="muted">
        Today: {sent("EMAIL")} of {dailyLimit()} emails and {sent("WHATSAPP")} WhatsApp messages sent · {queued.length} approved emails waiting for their slot
        {worker.lastRunAt ? ` · worker ran ${ago(worker.lastRunAt)}` : " · worker hasn't run"}.
        {!sending && " Email sending isn't set up yet, so approved emails wait (or use “I sent it myself”)."}
      </p>

      <section className="panel" aria-labelledby="emails">
        <div className="panel-head">
          <h2 id="emails">Emails to approve ({emails.length})</h2>
          {canSend && emails.length > 1 && (
            <ActionForm action={approveAllAction} submit={`Approve all ${emails.length}`} variant="ghost sm" confirm={`I've read these ${emails.length} emails and approve them going out in our name.`} className="">
              {emails.map((m) => (
                <input key={m.id} type="hidden" name="messageId" value={m.id} />
              ))}
            </ActionForm>
          )}
        </div>
        <p className="faint" style={{ fontSize: "0.8125rem" }}>
          Approved emails go out one at a time from our mailbox, spaced a minute or two apart in sending hours, so they arrive like normal email. Every one ends with: “{OPT_OUT_LINE}”
        </p>
        {emails.length === 0 ? (
          <p className="empty">Nothing waiting.</p>
        ) : (
          <ul className="list" role="list">
            {emails.map((m) => (
              <li key={m.id}>
                <div className="item-head">
                  <span>
                    <Link className="code" href={`/os/prospects/${m.prospect.id}`}>
                      {m.prospect.code}
                    </Link>{" "}
                    {m.prospect.name} <span className="faint">· {m.toAddress}</span>
                  </span>
                  <span className="faint label">
                    {stepLabel(m.step)} · fit {m.prospect.fitScore ?? "—"}
                  </span>
                </div>
                {canEdit ? (
                  <ActionForm action={updateDraftAction} submit="Save edits" variant="ghost sm">
                    <input type="hidden" name="messageId" value={m.id} />
                    <input type="hidden" name="prospectId" value={m.prospect.id} />
                    <input type="hidden" name="toAddress" value={m.toAddress} />
                    <input className="input" name="subject" aria-label="Subject" defaultValue={m.subject ?? ""} required maxLength={120} />
                    <textarea className="input" name="body" aria-label="Message" defaultValue={m.body} rows={7} required minLength={20} maxLength={3000} />
                  </ActionForm>
                ) : (
                  <>
                    <p>
                      <b>{m.subject}</b>
                    </p>
                    <p className="prewrap">{m.body}</p>
                  </>
                )}
                {m.sendError && <p className="notice error">{m.sendError}</p>}
                <div className="row">
                  {canSend && (
                    <ActionForm action={approveEmailAction} submit="Approve" className="">
                      <input type="hidden" name="messageId" value={m.id} />
                      <input type="hidden" name="prospectId" value={m.prospect.id} />
                    </ActionForm>
                  )}
                  {canSend && sending && (
                    <ActionForm action={sendEmailAction} submit="Send now" variant="ghost" className="">
                      <input type="hidden" name="messageId" value={m.id} />
                      <input type="hidden" name="prospectId" value={m.prospect.id} />
                    </ActionForm>
                  )}
                  {canSend && !sending && (
                    <ActionForm action={markSentAction} submit="I sent it myself" variant="ghost" confirm="I sent exactly this from our mailbox, with the opt-out line." className="">
                      <input type="hidden" name="messageId" value={m.id} />
                      <input type="hidden" name="prospectId" value={m.prospect.id} />
                    </ActionForm>
                  )}
                  {canEdit && (
                    <ActionForm action={cancelDraftAction} submit="Skip this one" variant="danger sm" className="">
                      <input type="hidden" name="messageId" value={m.id} />
                      <input type="hidden" name="prospectId" value={m.prospect.id} />
                    </ActionForm>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel" aria-labelledby="whatsapp">
        <h2 id="whatsapp">WhatsApp to send ({whatsapps.length})</h2>
        <p className="faint" style={{ fontSize: "0.8125rem" }}>
          Sent by you from our WhatsApp Business number: “Open in WhatsApp” opens the chat with the message filled in. Read it, press send, then “Sent”. Work from
          the top; it&apos;s ordered follow-ups first.
        </p>
        {whatsapps.length === 0 ? (
          <p className="empty">Nothing waiting.</p>
        ) : (
          <ul className="list" role="list">
            {whatsapps.map((m) => {
              const link = whatsappLink(m.toAddress, m.body);
              return (
                <li key={m.id}>
                  <div className="item-head">
                    <span>
                      <Link className="code" href={`/os/prospects/${m.prospect.id}`}>
                        {m.prospect.code}
                      </Link>{" "}
                      {m.prospect.name} <span className="faint mono">· +{m.toAddress}</span>
                    </span>
                    <span className="faint label">
                      {stepLabel(m.step)} · fit {m.prospect.fitScore ?? "—"}
                    </span>
                  </div>
                  <p className="prewrap">{m.body}</p>
                  <div className="row">
                    {link && (
                      <a className="btn" href={link} target="_blank" rel="noopener noreferrer">
                        Open in WhatsApp
                      </a>
                    )}
                    {canSend && (
                      <ActionForm action={markSentAction} submit="Sent" variant="ghost" className="">
                        <input type="hidden" name="messageId" value={m.id} />
                        <input type="hidden" name="prospectId" value={m.prospect.id} />
                      </ActionForm>
                    )}
                    <Link className="btn ghost sm" href={`/os/prospects/${m.prospect.id}`}>
                      Edit
                    </Link>
                    {canEdit && (
                      <ActionForm action={cancelDraftAction} submit="Skip" variant="danger sm" className="">
                        <input type="hidden" name="messageId" value={m.id} />
                        <input type="hidden" name="prospectId" value={m.prospect.id} />
                      </ActionForm>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {queued.length > 0 && (
        <section className="panel" aria-labelledby="queued">
          <h2 id="queued">Approved, waiting for their slot ({queued.length})</h2>
          <ul className="list" role="list">
            {queued.map((m) => (
              <li key={m.id} className="item-head">
                <span>
                  <Link className="code" href={`/os/prospects/${m.prospect.id}`}>
                    {m.prospect.code}
                  </Link>{" "}
                  {m.prospect.name} · {m.subject} <span className="faint">· approved by {m.approvedBy}</span>
                </span>
                {canEdit && (
                  <ActionForm action={cancelDraftAction} submit="Cancel" variant="ghost sm" className="">
                    <input type="hidden" name="messageId" value={m.id} />
                    <input type="hidden" name="prospectId" value={m.prospect.id} />
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
