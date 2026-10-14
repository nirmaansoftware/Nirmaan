import type { Proposal } from "@prisma/client";
import { formatInr, scheduleAmounts, totalWeeks, viewOf } from "@/lib/proposals/model";

/**
 * The proposal exactly as the client sees it. Used by the client link
 * (/p/[token]) and the internal preview, so what the team checks is what
 * the client gets. Internal economics are not part of this component's
 * input, so they can't leak into it.
 */
type ClientFields = Pick<
  Proposal,
  | "code" | "version" | "title" | "problem" | "solution" | "scope" | "outOfScope" | "deliverables" | "milestones"
  | "technology" | "priceTotal" | "paymentSchedule" | "maintenance" | "assumptions" | "changePolicy" | "validUntil"
>;

export function toClientFields(p: Proposal): ClientFields {
  const {
    code, version, title, problem, solution, scope, outOfScope, deliverables, milestones,
    technology, priceTotal, paymentSchedule, maintenance, assumptions, changePolicy, validUntil,
  } = p;
  return { code, version, title, problem, solution, scope, outOfScope, deliverables, milestones, technology, priceTotal, paymentSchedule, maintenance, assumptions, changePolicy, validUntil };
}

export function ProposalDocument({ p, clientName }: { p: ClientFields; clientName: string }) {
  const v = viewOf(p);
  const weeks = totalWeeks(v.milestones);
  return (
    <>
      <header>
        <span className="label">
          Proposal {p.code}
          {p.version > 1 ? ` · version ${p.version}` : ""} · for {clientName}
        </span>
        <h1>{p.title}</h1>
        {p.validUntil && (
          <p className="faint">Valid until {p.validUntil.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</p>
        )}
      </header>

      <section>
        <h2>The problem</h2>
        <p className="prewrap">{p.problem}</p>
      </section>
      <section>
        <h2>What we propose</h2>
        <p className="prewrap">{p.solution}</p>
      </section>
      <section>
        <h2>In scope</h2>
        <ul className="bullets">{v.scope.map((s) => <li key={s}>{s}</li>)}</ul>
      </section>
      <section>
        <h2>Not in scope</h2>
        <ul className="bullets">{v.outOfScope.map((s) => <li key={s}>{s}</li>)}</ul>
      </section>
      <section>
        <h2>What you receive</h2>
        <ul className="bullets">{v.deliverables.map((s) => <li key={s}>{s}</li>)}</ul>
      </section>
      <section>
        <h2>Timeline</h2>
        <table className="table">
          <tbody>
            {v.milestones.map((m) => (
              <tr key={m.name}>
                <td>{m.name}</td>
                <td className="num" style={{ textAlign: "right" }}>{m.weeks} {m.weeks === 1 ? "week" : "weeks"}</td>
              </tr>
            ))}
            <tr>
              <td><b>Total</b></td>
              <td className="num" style={{ textAlign: "right" }}><b>about {weeks} weeks</b></td>
            </tr>
          </tbody>
        </table>
      </section>
      {p.technology && (
        <section>
          <h2>Technology</h2>
          <p className="prewrap">{p.technology}</p>
        </section>
      )}
      <section>
        <h2>Price</h2>
        <p style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "1.8rem" }} className="num">
          {formatInr(p.priceTotal)}
        </p>
        <table className="table">
          <tbody>
            {scheduleAmounts(p.priceTotal, v.paymentSchedule).map((s) => (
              <tr key={s.label}>
                <td>{s.label}</td>
                <td className="num faint">{s.percent}%</td>
                <td className="num" style={{ textAlign: "right" }}>{formatInr(s.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {v.maintenance && (
        <section>
          <h2>Optional: {v.maintenance.name}</h2>
          <p className="num">{formatInr(v.maintenance.monthly)} per month, after launch. You can start or stop it at any time.</p>
          {v.maintenance.includes.length > 0 && <ul className="bullets">{v.maintenance.includes.map((s) => <li key={s}>{s}</li>)}</ul>}
        </section>
      )}
      {v.assumptions.length > 0 && (
        <section>
          <h2>Assumptions behind this estimate</h2>
          <ul className="bullets">{v.assumptions.map((s) => <li key={s}>{s}</li>)}</ul>
        </section>
      )}
      <section>
        <h2>Changes during the project</h2>
        <p className="prewrap">{p.changePolicy}</p>
      </section>
    </>
  );
}
