import Link from "next/link";
import { getSnapshot } from "@/lib/data";
import { LiveProvider, LiveStamp } from "../_components/Live";
import { Logo } from "../_components/Logo";
import { HqNav } from "../_components/HqNav";

// Behind the login (src/proxy.ts). Every request renders the latest snapshot;
// the browser then keeps it live.
export const dynamic = "force-dynamic";

export default async function HqLayout({ children }: { children: React.ReactNode }) {
  const initial = await getSnapshot();
  return (
    <LiveProvider initial={initial}>
      <div className="shell">
        <aside className="side">
          <Link className="brand" href="/">
            <Logo />
            <b>Nirmaan</b>
            <span>HQ</span>
          </Link>
          <HqNav />
          <div className="side-foot">
            <LiveStamp />
            <a className="faint" href="/api/auth/logout">
              Sign out
            </a>
          </div>
        </aside>
        <main className="main" id="main">
          {children}
        </main>
      </div>
    </LiveProvider>
  );
}
