import type { Metadata } from "next";
import { NeedsYouView } from "@/app/_views/NeedsYouView";

export const metadata: Metadata = { title: "Needs you" };

export default function Page() {
  return <NeedsYouView />;
}
