import { ADDR, EXPLORER } from "@/lib/chain";
import { loadPreview } from "../../data";
import FundsActions from "../FundsActions";
import { StatGrid } from "@/components/ace/stat-grid";
import { IconWallet, IconLock, IconArrowBarToDown, IconAlertTriangle } from "@tabler/icons-react";

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

      <StatGrid
        cols={4}
        items={[
          { label: "Vault balance", icon: <IconWallet size={14} stroke={1.8} />,
            value: usd(vault.collateral), note: "tUSDC" },
          { label: "Reserved", icon: <IconLock size={14} stroke={1.8} />,
            value: usd(vault.reserved), note: "against open cover" },
          { label: "Withdrawable", icon: <IconArrowBarToDown size={14} stroke={1.8} />,
            value: usd(vault.free), note: "unconditional" },
          { label: "Unaccounted", icon: <IconAlertTriangle size={14} stroke={1.8} />,
            value: usd(vault.surplus),
            note: "expect 0 — anything else means tokens arrived outside deposit()",
            tone: vault.surplus > 0n ? "lost" : undefined },
        ]}
      />

      <section>
        <FundsActions />
      </section>
    </>
  );
}
