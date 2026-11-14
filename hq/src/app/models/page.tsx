import type { Metadata } from "next";
import { ModelsView } from "../_views/ModelsView";

export const metadata: Metadata = { title: "Models" };

export default function Page() {
  return <ModelsView />;
}
