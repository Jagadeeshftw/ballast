import type { Metadata } from "next";
import { Schibsted_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import "./theme.css";

/* Schibsted Grotesk carries the page; IBM Plex Mono carries the evidence — hashes, blocks,
   timestamps, figures. The mono is identity here, not debug output. */
const sans = Schibsted_Grotesk({ subsets: ["latin"], display: "swap", variable: "--font-schibsted" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap", variable: "--font-plex-mono" });

const title = "Ballast — parametric cover on dreamDEX Event Contracts";
const description =
  "Cover bought by the chain itself, in the same block a window opens. Live on Somnia testnet, readable without a wallet.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, type: "website" },
  twitter: { card: "summary_large_image", title, description },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        {/* Runs before first paint, so the server-rendered page never shows the wrong theme
            and then corrects itself. Reads an explicit choice first, falls back to the OS. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('ballast.theme');if(!t){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
