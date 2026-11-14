import type { Metadata } from "next";
import { Logo } from "../_components/Logo";
import { safeNext } from "@/lib/session";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  denied: "That GitHub account is not allowed into hq.",
  state: "The sign-in expired or was tampered with. Try again.",
  github: "GitHub did not complete the sign-in. Try again.",
};

/** Public page: shows nothing about Nirmaan's state, only the sign-in button. */
export default async function Login({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : null);
  const error = typeof params.error === "string" ? ERRORS[params.error] : undefined;
  return (
    <main className="auth">
      <div className="panel">
        <span className="brand">
          <Logo />
          <b>Nirmaan</b>
          <span>HQ</span>
        </span>
        <h1>Sign in</h1>
        <p className="muted">Founder only. Sign in with an allowed GitHub account.</p>
        {error && <p className="notice error">{error}</p>}
        <a className="btn" href={`/api/auth/login?next=${encodeURIComponent(next)}`}>
          Sign in with GitHub
        </a>
      </div>
    </main>
  );
}
