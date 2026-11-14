"use client";

import { useSnapshot } from "./Live";

/** Says plainly when the page shows sample data, so nothing is mistaken for live state. */
export function SampleNote() {
  const s = useSnapshot();
  if (s.source !== "sample") return null;
  return (
    <p className="notice warn sample-note">
      Sample data. The live feed is not connected yet; every number on this page is illustrative.
    </p>
  );
}
