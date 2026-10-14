import type { Metadata } from "next";
import { proposalForToken } from "@/lib/proposals/service";
import { ActionForm } from "../../_components/ActionForm";
import { Logo } from "../../_components/Logo";
import { ProposalDocument, toClientFields } from "../../_components/ProposalDocument";
import { clientDecisionAction } from "./actions";

export const metadata: Metadata = {
  title: "Your proposal",
  // The URL is a secret: don't send it to any site linked from this page.
  referrer: "no-referrer",
};

export default async function ClientProposalPage({ params }: PageProps<"/p/[token]">) {
  const { token } = await params;
  const p = await proposalForToken(token);

  if (!p) {
    return (
      <main className="client">
        <Brand />
        <h1>This link isn&apos;t active</h1>
        <p className="muted">
          Proposal links stop working once the proposal is answered or a newer version is sent. Please ask Nirmaan for the latest link.
        </p>
      </main>
    );
  }

  const expired = p.validUntil !== null && p.validUntil < new Date();
  return (
    <main className="client">
      <Brand />
      <ProposalDocument p={toClientFields(p)} clientName={p.lead.company ?? p.lead.contactName} />

      <section className="panel" aria-labelledby="decide">
        <h2 id="decide">Your decision</h2>
        {p.status !== "SENT" ? (
          <p className="muted">This proposal has already been answered. Thank you.</p>
        ) : expired ? (
          <p className="notice warn">This proposal has expired. Ask Nirmaan for an updated one.</p>
        ) : (
          <ActionForm action={clientDecisionAction} submit="Send my decision" pendingLabel="Sending…">
            <input type="hidden" name="token" value={token} />
            <fieldset style={{ border: 0, padding: 0, display: "grid", gap: "0.5rem" }}>
              <legend className="label" style={{ marginBottom: "0.4rem" }}>
                I would like to…
              </legend>
              <label className="check">
                <input type="radio" name="decision" value="APPROVE" required /> Approve this proposal and start the project
              </label>
              <label className="check">
                <input type="radio" name="decision" value="CLARIFY" /> Ask questions or request changes first
              </label>
              <label className="check">
                <input type="radio" name="decision" value="REJECT" /> Decline
              </label>
            </fieldset>
            <label className="field">
              <span className="label-text">Your full name</span>
              <input className="input" name="name" autoComplete="name" required maxLength={120} />
            </label>
            <label className="field">
              <span className="label-text">Notes or questions</span>
              <textarea className="input" name="note" rows={4} maxLength={4000} />
              <span className="hint">Required if you&apos;re asking for changes or declining.</span>
            </label>
            <p className="faint" style={{ fontSize: "0.8125rem" }}>
              Approving confirms the scope, price and payment schedule above. Anything outside the scope is handled as a separate change request, only with your written approval.
            </p>
          </ActionForm>
        )}
      </section>
    </main>
  );
}

function Brand() {
  return (
    <div className="brand">
      <Logo />
      <b>Nirmaan</b>
      <span>SOFTWARE STUDIO</span>
    </div>
  );
}
