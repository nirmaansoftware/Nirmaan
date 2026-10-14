"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem {
  href: string;
  label: string;
  count?: number;
  group?: string;
}

export function NavLinks({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Nirmaan OS">
      {items.map((item, i) => {
        const active = item.href === "/os" ? path === "/os" : path.startsWith(item.href);
        // A group heading appears above the first item of each group.
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
