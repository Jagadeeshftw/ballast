/**
 * What to do when there is no wallet in this browser.
 *
 * The three states a reader can be in are deliberately distinct, because the way out of each
 * is different:
 *
 *   no wallet      no EIP-1193 provider at all. Nothing to connect to, so the answer is to
 *                  install one or move to a device that has one. This is that state.
 *   not connected  a provider exists but has authorised no account. A locked wallet and a
 *                  wallet that has simply never been connected are the same case here --
 *                  eth_accounts returns empty for both and the standard gives no way to tell
 *                  them apart -- and they also have the same remedy, since clicking connect
 *                  prompts to unlock. So they share one state and one button rather than a
 *                  guess presented as a diagnosis.
 *   wrong network  connected, but to another chain. The remedy is a switch, not a connect,
 *                  and it says so.
 *
 * The state used to describe the problem and stop there. Naming a problem without a way out
 * is not much better than not naming it.
 */
export default function NoWallet({ verb }: { verb: string }) {
  return (
    <>
      <p className="why">
        There is no EVM wallet in this browser, so {verb} cannot be signed from here. Nothing
        else is affected: every figure on this dashboard is read from the chain when the page
        is requested, and stays readable without one.
      </p>
      <p className="why">
        To transact, either{" "}
        <a href="https://metamask.io/download/" target="_blank" rel="noreferrer">install a wallet</a>{" "}
        and point it at <strong>Somnia Shannon testnet, chain 50312</strong> —{" "}
        <a href="https://docs.somnia.network/developer/network-info" target="_blank" rel="noreferrer">
          the network details are here
        </a>
        , and connecting offers to add it for you — or open this page on a device where you
        already have one.
      </p>
    </>
  );
}
