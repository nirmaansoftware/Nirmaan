import type { Metadata } from "next";
import { requireClientUser } from "@/lib/web/session";
import { Logo } from "../_components/Logo";
import { logout } from "../login/actions";

export const metadata: Metadata = { title: "Your projects" };

export default async function PortalLayout({ children }: LayoutProps<"/portal">) {
  const user = await requireClientUser();
  return (
    <div className="client" style={{ maxWidth: "64rem" }}>
      <header className="portal-bar">
        <div className="brand">
          <Logo />
          <b>Nirmaan</b>
          <span>CLIENT PORTAL</span>
        </div>
        <div className="row">
          <span className="faint">{user.name}</span>
          <form action={logout}>
            <button className="btn ghost sm" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>
      {children}
    </div>
  );
}
