import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "Ballast — parametric cover on dreamDEX Event Contracts";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * A blank share card reads as abandoned, and the DoraHacks entry renders one.
 *
 * Night-bridge palette, matching the page it links to — a share card in the old light theme
 * would have been the first thing anyone saw and the last thing that looked like the product.
 * The mark is the Plimsoll line: a circle with a bar through it.
 */
export default async function Image() {
  const deep = "#06131A", hull = "#0D2129", rail = "#17323C";
  const bone = "#EAF2F3", chart = "#8FA6AE", covered = "#2FBFA3";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          justifyContent: "space-between", background: deep, color: bone,
          padding: "56px 64px", fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 20, border: `3px solid ${bone}`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <div style={{ width: 52, height: 4, background: covered }} />
            </div>
            <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>Ballast</div>
          </div>

          <div style={{
            display: "flex", flexWrap: "wrap", gap: "0 16px",
            fontSize: 54, fontWeight: 700, lineHeight: 1.12, letterSpacing: -1.6, maxWidth: 1040,
          }}>
            <div>Automatic downside cover, bought by</div>
            <div style={{ color: covered }}>the chain itself.</div>
          </div>

          <div style={{ fontSize: 26, color: chart, lineHeight: 1.4, maxWidth: 880 }}>
            Parametric cover on dreamDEX Event Contracts, bought in the same block a window
            opens. No keeper, no cron.
          </div>
        </div>

        {/* The load line, engraved. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 20, color: chart }}>
            <div style={{ display: "flex" }}>strike &middot; the window&rsquo;s open</div>
            <div style={{ display: "flex" }}>covered down to &minus;2.50%</div>
          </div>
          <div style={{ height: 2, background: bone, width: "100%" }} />
          <div style={{ height: 52, background: hull, borderLeft: `1px solid ${rail}`, borderRight: `1px solid ${rail}`, display: "flex" }} />
          <div style={{ height: 5, background: covered, width: "100%" }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, color: chart, marginTop: 8 }}>
            <div style={{ display: "flex" }}>Somnia Shannon testnet · live</div>
            <div style={{ display: "flex", color: covered, fontWeight: 700 }}>0 blocks of latency</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
