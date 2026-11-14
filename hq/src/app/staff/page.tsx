import type { Metadata } from "next";
import { StaffView } from "../_views/StaffView";

export const metadata: Metadata = { title: "Staff" };

export default function Page() {
  return <StaffView />;
}
