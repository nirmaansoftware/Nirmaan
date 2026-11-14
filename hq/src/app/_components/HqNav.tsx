"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSnapshot } from "./Live";

/** The side navigation; counts come from the live snapshot. Markup and classes as the OS nav. */
export function HqNav() {
  const path = usePathname();
  const s = useSnapshot();
  const working = s.lanes.filter((l) => l.status === "working").length;
  const items = [
    { href: "/", label: "Overview", count: s.waiting.length },
    { href: "/agents", label: "Live agents", count: working },
    { href: "/reviews", label: "Reviews", count: s.reviews.filter((r) => r.stage !== "merged").length },
    { href: "/evals", label: "Evals", count: s.evals.filter((e) => e.status === "running").length },
    { href: "/models", label: "Models" },
    { href: "/staff", label: "Staff" },
  ];
  return (
    <nav className="nav" aria-label="Nirmaan HQ">
      {items.map((item) => {
        const active = item.href === "/" ? path === "/" : path.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}>
            {item.label}
            {item.count ? <span className="count">{item.count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
