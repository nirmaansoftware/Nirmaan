"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSnapshot } from "./Live";
import { busyMap } from "@/lib/plain";

/** The side navigation: plain sections first, technical detail under "Under the hood". OS nav markup. */
export function HqNav() {
  const path = usePathname();
  const s = useSnapshot();
  const items = [
    { href: "/", label: "Today" },
    { href: "/team", label: "Team", count: busyMap(s).size },
    { href: "/work", label: "Work", count: s.lanes.filter((l) => l.status === "working").length },
    { href: "/needs-you", label: "Needs you", count: s.waiting.length },
    { href: "/goals", label: "Goals" },
    { href: "/reviews", label: "Reviews", group: "Under the hood" },
    { href: "/evals", label: "Evals", group: "Under the hood" },
    { href: "/models", label: "Models", group: "Under the hood" },
    { href: "/skills", label: "Skills", group: "Under the hood" },
  ];
  return (
    <nav className="nav" aria-label="Nirmaan HQ">
      {items.map((item, i) => {
        const active = item.href === "/" ? path === "/" : path.startsWith(item.href);
        const header = item.group && item.group !== items[i - 1]?.group ? item.group : null;
        return (
          <span key={item.href} style={{ display: "contents" }}>
            {header && <span className="nav-group label">{header}</span>}
            <Link href={item.href} aria-current={active ? "page" : undefined}>
              {item.label}
              {item.count ? <span className="count">{item.count}</span> : null}
            </Link>
          </span>
        );
      })}
    </nav>
  );
}
