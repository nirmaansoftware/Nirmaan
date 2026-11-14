import type { Metadata } from "next";
import { WorkView } from "@/app/_views/WorkView";

export const metadata: Metadata = { title: "Work" };

export default function Page() {
  return <WorkView />;
}
