import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/web/session";
import { NoAccess } from "../../../../_components/ui";
import { ProposalDocument, toClientFields } from "../../../../_components/ProposalDocument";

export const metadata: Metadata = { title: "Client preview" };

export default async function PreviewPage({ params }: PageProps<"/os/proposals/[id]/preview">) {
  const user = await requireUser();
  if (!can(user.role, "proposal:read")) return <NoAccess capability="proposal:read" />;
  const p = await prisma.proposal.findUnique({ where: { id: (await params).id }, include: { lead: true } });
  if (!p) notFound();
  return (
    <>
      <p className="notice info">
        Client preview: exactly what the client sees on their link, minus the decision buttons. <Link href={`/os/proposals/${p.id}`}>Back to editing</Link>
      </p>
      <article className="client" style={{ padding: 0, margin: 0 }}>
        <ProposalDocument p={toClientFields(p)} clientName={p.lead.company ?? p.lead.contactName} />
      </article>
    </>
  );
}
