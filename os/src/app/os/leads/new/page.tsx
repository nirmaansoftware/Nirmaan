import type { Metadata } from "next";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/web/session";
import { ActionForm } from "../../../_components/ActionForm";
import { NoAccess, PageHead } from "../../../_components/ui";
import { createLeadAction } from "../../actions/leads";

export const metadata: Metadata = { title: "Add a lead" };

export default async function NewLeadPage() {
  const user = await requireUser();
  if (!can(user.role, "lead:write")) return <NoAccess capability="lead:write" />;
  return (
    <>
      <PageHead title="Add a lead" crumbs={[{ href: "/os/leads", label: "Leads" }]} />
      <div className="panel">
        <p className="muted">
          Write the problem the way the customer described it. Don&apos;t translate it into a solution yet; discovery does that.
        </p>
        <ActionForm action={createLeadAction} submit="Create lead" pendingLabel="Creating…">
          <div className="field">
            <label htmlFor="problem">The problem, in their words</label>
            <textarea className="input" id="problem" name="problem" required rows={5} />
          </div>
          <div className="form-row">
            <div className="field">
              <label htmlFor="contactName">Contact name</label>
              <input className="input" id="contactName" name="contactName" required />
            </div>
            <div className="field">
              <label htmlFor="contactEmail">Email</label>
              <input className="input" id="contactEmail" name="contactEmail" type="email" required />
            </div>
            <div className="field">
              <label htmlFor="contactPhone">Phone</label>
              <input className="input" id="contactPhone" name="contactPhone" type="tel" />
            </div>
            <div className="field">
              <label htmlFor="company">Company</label>
              <input className="input" id="company" name="company" />
            </div>
          </div>
          <div className="form-row">
            <div className="field">
              <label htmlFor="business">What the business does</label>
              <input className="input" id="business" name="business" />
            </div>
            <div className="field">
              <label htmlFor="currentSolution">How they handle it today</label>
              <input className="input" id="currentSolution" name="currentSolution" />
            </div>
            <div className="field">
              <label htmlFor="desiredOutcome">Desired outcome</label>
              <input className="input" id="desiredOutcome" name="desiredOutcome" />
            </div>
          </div>
          <div className="form-row">
            <div className="field">
              <label htmlFor="budgetRange">Budget range</label>
              <input className="input" id="budgetRange" name="budgetRange" />
            </div>
            <div className="field">
              <label htmlFor="timeline">Timeline</label>
              <input className="input" id="timeline" name="timeline" />
            </div>
            <div className="field">
              <label htmlFor="source">Source</label>
              <select className="input" id="source" name="source" defaultValue="MANUAL">
                <option value="MANUAL">Direct (call, email, meeting)</option>
                <option value="REFERRAL">Referral</option>
              </select>
            </div>
          </div>
        </ActionForm>
      </div>
    </>
  );
}
