import type { Metadata } from "next";
import { EvalsView } from "../_views/EvalsView";

export const metadata: Metadata = { title: "Evals" };

export default function Page() {
  return <EvalsView />;
}
