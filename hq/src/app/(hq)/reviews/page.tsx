import type { Metadata } from "next";
import { ReviewsView } from "@/app/_views/ReviewsView";

export const metadata: Metadata = { title: "Reviews" };

export default function Page() {
  return <ReviewsView />;
}
