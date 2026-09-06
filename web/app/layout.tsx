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
  /* Icons are the mark alone, cropped from the full lockup: the wordmark under it is
     illegible below about 128px, so a favicon carrying it would be mud.

     They used to ship with the lockup's black ground baked in, on the reasoning that a
     favicon sits on browser chrome rather than on the page. That was wrong in practice: a
     browser draws the icon on ITS ground, so an opaque black square is a black tile in a
     light-themed tab strip. The mark now carries its own alpha, taken off the black it was
     drawn on, and sits on either.

     apple-touch-icon is the deliberate exception. iOS composites a transparent home-screen
     icon over black, which would reintroduce exactly that tile, so it keeps an opaque
     ground -- chosen, in the brand's raised colour, with the padding iOS expects. */
  icons: {
    icon: [
      { url: "/icon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
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
