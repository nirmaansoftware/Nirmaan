import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted, so `next build` needs no network. The files in ./fonts are the
// official variable fonts from github.com/google/fonts (ofl/archivo,
// ofl/hankengrotesk, ofl/jetbrainsmono; same versions Google Fonts serves),
// subset with fontTools to exactly the characters next/font/google used to
// serve for them (latin, latin-ext, vietnamese, and Cyrillic and Greek where
// the family has them), with all variation axes and layout features kept and
// hinting dropped, as Google does. Glyph outlines, advances and vertical
// metrics match the Google files. Licences: ./fonts/OFL-*.txt.
//
// The metric-matched Arial fallbacks ("... Fallback", in globals.css) carry
// the values next/font/google generated, so text looks the same while the
// font loads too. (next/font/local names each face after its const below.)
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
// The file is variable (400 to 800); only 400 and 500 were loaded before, so
// the face is declared for that range and heavier requests still synthesize.
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
  title: { default: "Nirmaan OS", template: "%s · Nirmaan OS" },
  description: "Nirmaan's internal operating system and client portal.",
  // Internal tool and private client links: never index any of it.
  robots: { index: false, follow: false },
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-IN" className={`${archivo.variable} ${hanken.variable} ${jetbrains.variable}`}>
      <body>{children}</body>
    </html>
  );
}
