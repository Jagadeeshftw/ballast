import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";

/** One family, two widths. Normal for everything readable; the width axis is pushed to
 *  expanded for gauge numerals only, so the large figures read as engraved instrument marks
 *  rather than as dashboard stats. Not six weights of Inter. */
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
  variable: "--font-archivo",
});

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
    <html lang="en" className={archivo.variable}>
      <body>{children}</body>
    </html>
  );
}
