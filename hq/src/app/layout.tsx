import type { Metadata, Viewport } from "next";
import Link from "next/link";
import localFont from "next/font/local";
import "./os-system.css";
import "./hq.css";
import { getSnapshot } from "@/lib/data";
import { LiveProvider, LiveStamp } from "./_components/Live";
import { Logo } from "./_components/Logo";
import { HqNav } from "./_components/HqNav";

// Same self-hosted fonts and settings as the OS (os/src/app/layout.tsx).
const archivo = localFont({
  src: "./fonts/archivo.woff2",
  weight: "100 900",
  style: "normal",
  declarations: [{ prop: "font-stretch", value: "62% 125%" }],
  fallback: ["Archivo Fallback"],
  adjustFontFallback: false,
  variable: "--font-archivo",
  display: "swap",
});
const hanken = localFont({
  src: "./fonts/hanken-grotesk.woff2",
  weight: "100 900",
  style: "normal",
  fallback: ["Hanken Grotesk Fallback"],
  adjustFontFallback: false,
  variable: "--font-hanken",
  display: "swap",
});
const jetbrains = localFont({
  src: "./fonts/jetbrains-mono.woff2",
  weight: "400 500",
  style: "normal",
  fallback: ["JetBrains Mono Fallback"],
  adjustFontFallback: false,
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Nirmaan HQ", template: "%s · Nirmaan HQ" },
  description: "The founder's live view of the Nirmaan ecosystem.",
  // Internal and login-only: never index any of it.
  robots: { index: false, follow: false },
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0e0f" },
  ],
};

// Every request renders the latest snapshot; the browser then keeps it live.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const initial = await getSnapshot();
  return (
    <html lang="en-IN" className={`${archivo.variable} ${hanken.variable} ${jetbrains.variable}`}>
      <body>
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
              </div>
            </aside>
            <main className="main" id="main">
              {children}
            </main>
          </div>
        </LiveProvider>
      </body>
    </html>
  );
}
