import type { Metadata } from "next";
import { StaffView } from "@/app/_views/StaffView";

export const metadata: Metadata = { title: "Staff" };

export default function Page() {
  return <StaffView />;
}
