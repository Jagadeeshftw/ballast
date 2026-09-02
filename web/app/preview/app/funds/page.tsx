import { ADDR, EXPLORER } from "@/lib/chain";
import { loadPreview } from "../../data";
import FundsActions from "../FundsActions";

export const dynamic = "force-dynamic";

const usd = (v: bigint) => (Number(v) / 1e6).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Money in, money out. */
export default async function Funds() {
  const { vault } = await loadPreview();

  return (
    <>
      <h1 className="viewH1">Funds</h1>
      <p className="why" style={{ marginTop: 8 }}>
        Collateral held by{" "}
        <a className="mono" href={`${EXPLORER}/address/${ADDR.vault}`}>BallastVault</a> for the
        demonstration account. Ballast is the trader of record: it holds positions in its own
        name and never touches your dreamDEX account.
      </p>

      <section className="band statusBand">
        <div className="statusGrid">
          <div><dt>Vault balance</dt><dd className="big">{usd(vault.collateral)}</dd><dd className="sub">tUSDC</dd></div>
          <div><dt>Reserved</dt><dd className="big">{usd(vault.reserved)}</dd><dd className="sub">against open cover</dd></div>
          <div><dt>Withdrawable</dt><dd className="big">{usd(vault.free)}</dd><dd className="sub">unconditional</dd></div>
          <div>
            <dt>Unaccounted</dt><dd className="big">{usd(vault.surplus)}</dd>
            <dd className="sub">expect 0 — anything else means tokens arrived outside deposit()</dd>
          </div>
        </div>
      </section>

      <section>
        <FundsActions />
      </section>
    </>
  );
}
