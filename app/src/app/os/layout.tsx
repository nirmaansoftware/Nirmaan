import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/web/session";
import type { Role } from "@/lib/db/enums";
import { Logo } from "../_components/Logo";
import { NavLinks, type NavItem } from "../_components/NavLinks";
import { logout } from "../login/actions";

export default async function OsLayout({ children }: LayoutProps<"/os">) {
  const user = await requireUser();
  const role = user.role as Role;
  const [pendingApprovals, newLeads, openSupport, replied, toReview, accessRequests] = await Promise.all([
    can(role, "approval:decide") ? prisma.approval.count({ where: { status: "PENDING" } }) : Promise.resolve(0),
    can(role, "lead:read") ? prisma.lead.count({ where: { status: "NEW" } }) : Promise.resolve(0),
    can(role, "support:write") ? prisma.supportRequest.count({ where: { status: "OPEN" } }) : Promise.resolve(0),
    // Prospects who replied and are waiting to become leads.
    can(role, "prospect:read") ? prisma.prospect.count({ where: { status: "REPLIED" } }) : Promise.resolve(0),
    // Messages waiting for a person: emails to approve, WhatsApp to send.
    can(role, "prospect:read") ? prisma.outreachMessage.count({ where: { status: "DRAFT" } }) : Promise.resolve(0),
    can(role, "user:manage") ? prisma.accessRequest.count({ where: { status: "PENDING" } }) : Promise.resolve(0),
  ]);

  const items: NavItem[] = [
    can(role, "dashboard:read") && { href: "/os", label: "Today" },
    can(role, "growth:read") && { href: "/os/growth", label: "Growth" },
    can(role, "prospect:read") && { href: "/os/campaigns", label: "Campaigns", group: "Pipeline" },
    can(role, "prospect:read") && { href: "/os/outreach", label: "Outreach", count: toReview, group: "Pipeline" },
    can(role, "prospect:read") && { href: "/os/prospects", label: "Prospects", count: replied, group: "Pipeline" },
    can(role, "lead:read") && { href: "/os/leads", label: "Leads", count: newLeads, group: "Pipeline" },
    can(role, "proposal:read") && { href: "/os/proposals", label: "Proposals", group: "Pipeline" },
    can(role, "project:read") && { href: "/os/projects", label: "Projects", group: "Delivery" },
    can(role, "approval:decide") && { href: "/os/approvals", label: "Approvals", count: pendingApprovals, group: "Delivery" },
    can(role, "support:write") && { href: "/os/support", label: "Support", count: openSupport, group: "Delivery" },
    can(role, "knowledge:read") && { href: "/os/knowledge", label: "Knowledge", group: "Knowledge & IP" },
    can(role, "knowledge:read") && { href: "/os/ip", label: "IP library", group: "Knowledge & IP" },
    can(role, "finance:read") && { href: "/os/patterns", label: "Patterns", group: "Knowledge & IP" },
    can(role, "finance:read") && { href: "/os/finance", label: "Finance", group: "Company" },
    can(role, "ai:read") && { href: "/os/ai", label: "AI usage", group: "Company" },
    can(role, "audit:read") && { href: "/os/audit", label: "Audit log", group: "Company" },
    can(role, "user:manage") && { href: "/os/team", label: "Team", count: accessRequests, group: "Company" },
  ].filter(Boolean) as NavItem[];

  return (
    <div className="shell">
      <aside className="side">
        <Link className="brand" href="/os">
          <Logo />
          <b>Nirmaan</b>
          <span>OS</span>
        </Link>
        <NavLinks items={items} />
        <div className="side-foot">
          <span>
            {user.name} <span className="faint">· {ROLE_LABELS[role] ?? role}</span>
          </span>
          <form action={logout}>
            <button className="btn ghost sm" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="main" id="main">
        {children}
      </main>
    </div>
  );
}
