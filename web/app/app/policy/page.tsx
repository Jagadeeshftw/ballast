import { ADDR, EXPLORER } from "@/lib/chain";
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
        A policy is consent with limits: how deep a fall you want made whole, the most you will
        pay per window, and when it expires. Without one the engine can do nothing — consent is
        a contract state, not a setting in our database. Priced against{" "}
        {shown ? `the live ${shown.asset} · ${shown.intervalLabel} window` : "the most recent window"}.
      </p>
      {/* The demonstration account's policy is shown as an example and attributed. The editor
          below reads the CONNECTED wallet's own policy, which is a different thing and used to
          be conflated with this one. */}
      <p className="why">
        {live
          ? <>For reference, the demonstration account{" "}
              <a className="mono" href={`${EXPLORER}/address/${ADDR.demoUser}`}>{ADDR.demoUser.slice(0, 10)}…</a>{" "}
              runs {(current.makeWholeBps / 100).toFixed(2)}% made whole, at most{" "}
              {(current.premiumBps / 100).toFixed(2)}% per window, until {utc(current.expiry)}.{" "}
              <strong>That is not your policy</strong> — yours is below.</>
          : <>The demonstration account has no active policy either.</>}
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
