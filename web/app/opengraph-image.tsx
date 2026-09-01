import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "Ballast — parametric cover on dreamDEX Event Contracts";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** A blank share card reads as abandoned, and the DoraHacks entry renders one. */
export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          justifyContent: "space-between", background: "#e9edec", color: "#0e1a1f",
          padding: "72px 80px", fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: "-0.03em" }}>Ballast</div>
          <div style={{ fontSize: 34, color: "#626d6e", lineHeight: 1.35, maxWidth: 900 }}>
            Parametric cover on dreamDEX Event Contracts, bought by the chain itself in the
            same block a window opens.
          </div>
        </div>

        {/* The load line, drawn as the mark it is. */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 48 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
            <div style={{ height: 3, background: "#0e1a1f", width: "100%" }} />
            <div style={{ fontSize: 22, color: "#626d6e" }}>strike · the window&rsquo;s open</div>
            <div style={{ height: 34 }} />
            <div style={{ height: 5, background: "#1f6f6b", width: "100%" }} />
            <div style={{ fontSize: 22, color: "#1f6f6b", fontWeight: 700 }}>
              load line · covered down to here
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <div style={{ fontSize: 22, color: "#626d6e" }}>no keeper, no cron</div>
            <div style={{ fontSize: 22, color: "#626d6e" }}>Somnia testnet · live</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
