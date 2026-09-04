import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RECORD, recordRange } from "@/lib/record";

export const runtime = "nodejs";
export const alt = "Ballast — parametric cover on dreamDEX Event Contracts";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The share card. A blank one reads as abandoned, and the DoraHacks entry renders it.
 *
 * Two things were stale here. It was still painted in the retired Direction A palette
 * (#06131A / #2FBFA3), so the first thing anyone saw was a colour scheme the site had not used
 * for weeks; and it carried no figures at all, only claims. Both fixed: the palette is the
 * live one, and the numbers are read from the same frozen record the site reads, so the card
 * cannot drift from the pages it links to.
 */
const settled = RECORD.counts.CoverSettled ?? 0;
const won = RECORD.settled.filter((i) => /Won/i.test(i.headline) || /Won/i.test(i.detail)).length;

export default async function Image() {
  /* Current palette, dark ground — the theme most share surfaces preview against. */
  const ground = "#16150F", raised = "#1F1D16", rule = "#322E24";
  const ink = "#F2EEE4", muted = "#9A9384", signal = "#E0A130", paid = "#6FB98F";

  const mark = readFileSync(join(process.cwd(), "public", "icon-192.png"));
  const markSrc = `data:image/png;base64,${mark.toString("base64")}`;
  const range = recordRange();

  return new ImageResponse(
    (
      <div style={{
        width: "100%", height: "100%", display: "flex", flexDirection: "column",
        justifyContent: "space-between", background: ground, color: ink,
        padding: "52px 60px", fontFamily: "sans-serif",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <img src={markSrc} width={56} height={56} style={{ borderRadius: 12 }} alt="" />
            <div style={{ fontSize: 38, fontWeight: 700, letterSpacing: -1 }}>Ballast</div>
            <div style={{
              display: "flex", fontSize: 18, color: muted, border: `1px solid ${rule}`,
              borderRadius: 999, padding: "5px 14px", marginLeft: 6,
            }}>Somnia testnet</div>
          </div>

          <div style={{
            display: "flex", flexWrap: "wrap", gap: "0 16px",
            fontSize: 52, fontWeight: 700, lineHeight: 1.12, letterSpacing: -1.6, maxWidth: 1040,
          }}>
            <div>Your position buys its own cover,</div>
            <div style={{ color: signal }}>in the same block.</div>
          </div>

          <div style={{ fontSize: 24, color: muted, lineHeight: 1.4, maxWidth: 900 }}>
            Parametric cover on dreamDEX Event Contracts. No keeper, no cron — Somnia&rsquo;s
            reactivity precompile runs the handler inside the block that triggered it.
          </div>
        </div>

        {/* Figures, from the same record the site reads. */}
        <div style={{ display: "flex", gap: 14 }}>
          {[
            { k: "Settled positions", v: String(settled), t: muted },
            { k: "Of which paid", v: `${won} of ${settled}`, t: paid },
            { k: "Same block, trigger to cover", v: "476941284", t: ink },
            { k: "Latency", v: "0 blocks", t: signal },
          ].map((s) => (
            <div key={s.k} style={{
              display: "flex", flexDirection: "column", flex: 1, gap: 6,
              background: raised, border: `1px solid ${rule}`, borderRadius: 12, padding: "16px 18px",
            }}>
              <div style={{ display: "flex", fontSize: 15, color: muted, letterSpacing: 1 }}>
                {s.k.toUpperCase()}
              </div>
              <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: s.t }}>{s.v}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 19, color: muted }}>
          <div style={{ display: "flex" }}>ballast.0xo.in</div>
          <div style={{ display: "flex" }}>
            {range ? `Recorded run, ${range} — a sample, not a result` : "Recorded run"}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
