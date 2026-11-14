import type { Metadata } from "next";
import { EvalsView } from "@/app/_views/EvalsView";

export const metadata: Metadata = { title: "Evals" };

export default function Page() {
  return <EvalsView />;
}
