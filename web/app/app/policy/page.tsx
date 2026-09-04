import { ADDR } from "@/lib/chain";
import { loadPreview, utc } from "../../data";
import ChainNote from "@/components/site/ChainNote";
import PolicyEditor from "../PolicyEditor";

export const dynamic = "force-dynamic";

/** Read and write the policy. */
export default async function Policy() {
  const { vault, book, eth, shown, chainOk } = await loadPreview();
  const exposure = eth?.ok && eth.price ? eth.price * 2 : 0; // the demonstration account holds 2 WETH

  /* With the vault unreadable the editor still renders, showing no active policy — which is
     the truthful reading of "we could not confirm one" and matches what the engine would do. */
  const current = vault ? {
    active: vault.policy[0],
    makeWholeBps: Number(vault.policy[1]),
    premiumBps: Number(vault.policy[2]),
    expiry: Number(vault.policy[3]),
    notionalCap: Number(vault.policy[4]) / 1e6,
  } : { active: false, makeWholeBps: 250, premiumBps: 300, expiry: 0, notionalCap: 0 };
  const live = current.active && current.expiry * 1000 > Date.now();

  return (
    <>
      {!chainOk && <ChainNote />}
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
          book={book ? { coverPrice: book.coverPrice, bookQty: book.bookQty, lotSize: book.lotSize, priceable: book.priceable }
                      : { coverPrice: 0, bookQty: 0, lotSize: 0.001, priceable: false }}
          exposure={exposure}
          current={current}
        />
      </section>
    </>
  );
}
