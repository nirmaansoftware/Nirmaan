import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/web/session";
import { isClientRole } from "@/lib/db/enums";
import { ActionForm } from "../_components/ActionForm";
import { Logo } from "../_components/Logo";
import { login } from "./actions";
import { googleConfigured } from "@/lib/auth/google";
import { passwordLoginEnabled } from "@/lib/auth/password";

const GOOGLE_ERRORS: Record<string, string> = {
  "google-not-allowed": "isn't on the Nirmaan team yet. We've let the owner know; you'll get an email at this address as soon as you're added.",
  "google-declined": "isn't on the Nirmaan team, and the request to join was declined. If you think that's a mistake, contact nirmaansoftware@gmail.com.",
  "google-inactive": "has an account here, but it's turned off. Ask the owner to turn it back on.",
  "google-failed": "Google sign-in didn't work. Try again.",
  "google-expired": "The sign-in took too long or was started elsewhere. Try again.",
  "google-cancelled": "Google sign-in was cancelled.",
  "google-busy": "Too many sign-in attempts. Try again in a few minutes.",
  "google-off": "Google sign-in isn't set up yet.",
};

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const current = await getCurrentUser();
  if (current) redirect(isClientRole(current.role) ? "/portal" : "/os");
  const params = await searchParams;
  const next = params.next;
  const who = typeof params.as === "string" && params.as.length <= 254 ? params.as : "";
  const known = typeof params.error === "string" ? GOOGLE_ERRORS[params.error] : undefined;
  // Messages about an account start with the address that was used (or "That Google account").
  const error = known && /^(isn't|has an)/.test(known) ? `${who || "That Google account"} ${known}` : known;
  const google = googleConfigured();
  const passwords = passwordLoginEnabled();
  return (
    <main className="auth">
      <div className="panel">
        <div className="brand">
          <Logo />
          <b>Nirmaan</b>
          <span>OS</span>
        </div>
        <h1>Sign in</h1>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {google && (
          <>
            <a className="btn" href={`/api/auth/google${typeof next === "string" ? `?next=${encodeURIComponent(next)}` : ""}`} style={{ width: "100%", justifyContent: "center" }}>
              Sign in with Google
            </a>
            {passwords && (
              <p className="faint" style={{ textAlign: "center", margin: "0.25rem 0" }}>
                or with a password
              </p>
            )}
          </>
        )}
        {!google && !passwords && (
          <p className="notice error" role="alert">
            Sign-in isn&apos;t set up yet: password sign-in is off and Google sign-in needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.
          </p>
        )}
        {passwords && (
          <ActionForm action={login} submit="Sign in" pendingLabel="Signing in…">
            <input type="hidden" name="next" value={typeof next === "string" ? next : "/os"} />
            <div className="field">
              <label htmlFor="email">Email</label>
              <input className="input" id="email" name="email" type="email" autoComplete="username" required />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
          </ActionForm>
        )}
        <p className="faint" style={{ fontSize: "0.8125rem" }}>
          {passwords ? "Team and client accounts. Clients are taken to their portal." : "Only people with a Nirmaan OS account can sign in."}
        </p>
      </div>
    </main>
  );
}
