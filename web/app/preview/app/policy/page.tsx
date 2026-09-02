import { ADDR } from "@/lib/chain";
import { loadPreview, utc } from "../../data";
import PolicyEditor from "../PolicyEditor";

export const dynamic = "force-dynamic";

/** Read and write the policy. */
export default async function Policy() {
  const { vault, book, eth, shown } = await loadPreview();
  const exposure = eth?.ok && eth.price ? eth.price * 2 : 0; // the demonstration account holds 2 WETH

  const current = {
    active: vault.policy[0],
    makeWholeBps: Number(vault.policy[1]),
    premiumBps: Number(vault.policy[2]),
    expiry: Number(vault.policy[3]),
    notionalCap: Number(vault.policy[4]) / 1e6,
  };
  const live = current.active && current.expiry * 1000 > Date.now();

  return (
    <>
      <h1 className="viewH1">Policy</h1>
      <p className="why" style={{ marginTop: 8 }}>
        {live
          ? `Active on ${ADDR.demoUser.slice(0, 10)}… — make whole a fall of ${(current.makeWholeBps / 100).toFixed(2)}%, paying at most ${(current.premiumBps / 100).toFixed(2)}% of the position per window, until ${utc(current.expiry)}.`
          : "No active policy on the demonstration account. Without one the engine can do nothing, which is the point: consent is a contract state, not a setting in our database."}
        {" "}Priced against{" "}
        {shown ? `the live ${shown.asset} · ${shown.intervalLabel} window` : "the most recent window"}.
      </p>

      <section>
        <PolicyEditor
          book={{ coverPrice: book.coverPrice, bookQty: book.bookQty, lotSize: book.lotSize, priceable: book.priceable }}
          exposure={exposure}
          current={current}
        />
      </section>
    </>
  );
}
