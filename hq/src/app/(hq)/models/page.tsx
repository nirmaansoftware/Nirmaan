import type { Metadata } from "next";
import { ModelsView } from "@/app/_views/ModelsView";

export const metadata: Metadata = { title: "Models" };

export default function Page() {
  return <ModelsView />;
}
