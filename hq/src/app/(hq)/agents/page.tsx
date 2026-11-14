import type { Metadata } from "next";
import { AgentsView } from "@/app/_views/AgentsView";

export const metadata: Metadata = { title: "Live agents" };

export default function Page() {
  return <AgentsView />;
}
