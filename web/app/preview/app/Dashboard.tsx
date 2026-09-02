"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createPublicClient, createWalletClient, custom, http, formatUnits, parseAbi,
  type Address, type EIP1193Provider,
} from "viem";
import { somniaTestnet } from "viem/chains";
import { ADDR, EXPLORER, RPC } from "@/lib/chain";
import { explain } from "./errors";

/* Somnia charges far more than a fork does for new accounts and new storage: a first deposit
   measured 1,149,275 gas live against 48,343 on a fork, and a brand-new account's first
   transaction measured 1,379,707. Wallet estimation is not to be trusted with that, and the
   cost of over-provisioning is a fraction of a cent, so every limit here is roughly double
   the measured cold path. A transaction that dies at the signature prompt is the most
   damaging thing that can happen in a demo. */
const GAS = {
  faucet: 2_800_000n, mint: 2_800_000n, approve: 600_000n, deposit: 2_600_000n,
  setPolicy: 700_000n, enrol: 1_400_000n, revoke: 400_000n, withdraw: 500_000n,
} as const;

const WETH: Address = "0x4d8E02BBfCf205828A8352Af4376b165E123D7b0";

const erc20 = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function faucet(uint256)",
  "function mint(address,uint256)",
]);
const vaultAbi = parseAbi([
  "function deposit(uint256)",
  "function withdraw(uint256)",
  "function revoke()",
  "function setPolicy(uint16,uint16,uint256,uint64)",
  "function collateralOf(address) view returns (uint256)",
  "function freeBalanceOf(address) view returns (uint256)",
  "function reservedOf(address) view returns (uint256)",
  "function policyOf(address) view returns (bool,uint16,uint16,uint64,uint256)",
]);
const engineAbi = parseAbi(["function enrol()", "function withdrawEnrolment()", "function isEnrolled(address) view returns (bool)"]);
const sourceAbi = parseAbi([
  "function priceOf(bytes32) view returns (uint256,bool)",
  "function assetKeyFor(string) pure returns (bytes32)",
]);

const pub = createPublicClient({ chain: somniaTestnet, transport: http(RPC) });

type State = {
  stt: bigint; tusdc: bigint; weth: bigint; allowance: bigint;
  collateral: bigint; free: bigint; reserved: bigint;
  policy: readonly [boolean, number, number, bigint, bigint];
  enrolled: boolean; ethPrice: bigint; priceable: boolean;
};

const FAUCETS = [
  ["Official Somnia faucet", "https://testnet.somnia.network/"],
  ["Google Cloud", "https://cloud.google.com/application/web3/faucet/somnia/shannon"],
  ["Stakely", "https://stakely.io/faucet/somnia-testnet-stt"],
] as const;

export default function Dashboard() {
  const [provider, setProvider] = useState<EIP1193Provider | null>(null);
  const [account, setAccount] = useState<Address | null>(null);
  const [chainOk, setChainOk] = useState(true);
  const [s, setS] = useState<State | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tx, setTx] = useState<{ hash: string; what: string } | null>(null);
  const [bps, setBps] = useState(250);

  useEffect(() => {
    const p = (globalThis as { ethereum?: EIP1193Provider }).ethereum ?? null;
    setProvider(p);
    if (!p) return;
    const onAccounts = (a: unknown) => setAccount(((a as string[])[0] as Address) ?? null);
    const onChain = (c: unknown) => setChainOk(parseInt(c as string, 16) === somniaTestnet.id);
    p.on?.("accountsChanged", onAccounts);
    p.on?.("chainChanged", onChain);
    return () => { p.removeListener?.("accountsChanged", onAccounts); p.removeListener?.("chainChanged", onChain); };
  }, []);

  const refresh = useCallback(async (who: Address) => {
    const key = await pub.readContract({ address: ADDR.source as Address, abi: sourceAbi, functionName: "assetKeyFor", args: ["ETH"] });
    const [stt, tusdc, weth, allowance, collateral, free, reserved, policy, enrolled, price] = await Promise.all([
      pub.getBalance({ address: who }),
      pub.readContract({ address: ADDR.tusdc as Address, abi: erc20, functionName: "balanceOf", args: [who] }),
      pub.readContract({ address: WETH, abi: erc20, functionName: "balanceOf", args: [who] }),
      pub.readContract({ address: ADDR.tusdc as Address, abi: erc20, functionName: "allowance", args: [who, ADDR.vault as Address] }),
      pub.readContract({ address: ADDR.vault as Address, abi: vaultAbi, functionName: "collateralOf", args: [who] }),
      pub.readContract({ address: ADDR.vault as Address, abi: vaultAbi, functionName: "freeBalanceOf", args: [who] }),
      pub.readContract({ address: ADDR.vault as Address, abi: vaultAbi, functionName: "reservedOf", args: [who] }),
      pub.readContract({ address: ADDR.vault as Address, abi: vaultAbi, functionName: "policyOf", args: [who] }),
      pub.readContract({ address: ADDR.engine as Address, abi: engineAbi, functionName: "isEnrolled", args: [who] }),
      pub.readContract({ address: ADDR.source as Address, abi: sourceAbi, functionName: "priceOf", args: [key] }),
    ]);
    setS({
      stt, tusdc, weth, allowance, collateral, free, reserved,
      policy: policy as State["policy"], enrolled,
      ethPrice: price[0], priceable: price[1],
    });
  }, []);

  useEffect(() => { if (account) refresh(account); }, [account, refresh]);

  async function connect() {
    if (!provider) return;
    setErr(null);
    try {
      const accs = (await provider.request({ method: "eth_requestAccounts" })) as Address[];
      const cid = (await provider.request({ method: "eth_chainId" })) as string;
      if (parseInt(cid, 16) !== somniaTestnet.id) { setChainOk(false); await switchChain(); }
      else setChainOk(true);
      setAccount(accs[0]);
    } catch (e) { setErr(explain(e)); }
  }

  /** Wallets do not ship Somnia Shannon, so offer to add it rather than only to switch. */
  async function switchChain() {
    if (!provider) return;
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: `0x${somniaTestnet.id.toString(16)}` }] });
      setChainOk(true);
    } catch {
      try {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: `0x${somniaTestnet.id.toString(16)}`,
            chainName: somniaTestnet.name,
            nativeCurrency: somniaTestnet.nativeCurrency,
            rpcUrls: [RPC],
            blockExplorerUrls: [EXPLORER],
          }],
        });
        setChainOk(true);
      } catch (e) { setErr(explain(e)); }
    }
  }

  const send = useCallback(async (what: string, run: (w: ReturnType<typeof createWalletClient>) => Promise<`0x${string}`>) => {
    if (!provider || !account) return;
    setBusy(what); setErr(null); setTx(null);
    try {
      const wallet = createWalletClient({ account, chain: somniaTestnet, transport: custom(provider) });
      const hash = await run(wallet);
      setTx({ hash, what });
      await pub.waitForTransactionReceipt({ hash });
      await refresh(account);
    } catch (e) { setErr(explain(e)); }
    finally { setBusy(null); }
  }, [provider, account, refresh]);

  // ---------------------------------------------------------------- render

  if (!provider) {
    return (
      <div className="dPanel">
        <h3>No wallet detected</h3>
        <p className="dWhy">
          Everything on this page is readable without one — the live state below is read from
          the chain at request time. To transact, open this in a browser with an EVM wallet
          installed.
        </p>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="dPanel">
        <h3>Connect a wallet</h3>
        <p className="dWhy">
          Somnia Shannon testnet, chain 50312. If your wallet does not carry the network,
          connecting will offer to add it.
        </p>
        <button className="dBtn" onClick={connect}>Connect</button>
        {err && <p className="dErr">{err}</p>}
      </div>
    );
  }

  if (!chainOk) {
    return (
      <div className="dPanel dWarn">
        <h3>Wrong network</h3>
        <p className="dWhy">This wallet is on another chain. Ballast lives on Somnia Shannon testnet, 50312.</p>
        <button className="dBtn" onClick={switchChain}>Switch to Somnia</button>
        {err && <p className="dErr">{err}</p>}
      </div>
    );
  }

  if (!s) return <div className="dPanel"><p className="dWhy">Reading your position from the chain…</p></div>;

  const usd = (v: bigint) => (Number(v) / 1e6).toFixed(2);
  const policyActive = s.policy[0] && Number(s.policy[3]) * 1000 > Date.now();
  const exposure = s.priceable ? (s.weth * s.ethPrice) / 10n ** 18n / 10n ** 12n : 0n;

  // Zero STT is checked before anything else can fail, because estimation succeeds from an
  // empty account and the failure would otherwise surface at the signature prompt.
  if (s.stt === 0n) {
    return (
      <div className="dPanel dWarn">
        <h3>This account has no STT</h3>
        <p className="dWhy">
          Every transaction needs gas, and a brand-new account&rsquo;s first one costs about
          1.4 million gas — roughly 0.008 STT. Claim once from any of these and come back;
          one claim covers this whole flow many times over.
        </p>
        <ul className="dFaucets">
          {FAUCETS.map(([n, u]) => <li key={u}><a href={u} target="_blank" rel="noreferrer">{n}</a></li>)}
        </ul>
        <p className="dMono">{account}</p>
        <button className="dBtn ghost" onClick={() => refresh(account)}>I have claimed — check again</button>
      </div>
    );
  }

  const steps = [
    { n: "01", label: "Connect", done: true },
    { n: "02", label: "Test dollars", done: s.tusdc > 0n || s.collateral > 0n },
    { n: "03", label: "Test ETH", done: s.weth > 0n },
    { n: "04", label: "Deposit", done: s.collateral > 0n },
    { n: "05", label: "Load line", done: policyActive },
    { n: "06", label: "Enrol", done: s.enrolled },
  ];
  const current = steps.find((x) => !x.done)?.n ?? "06";
  // Someone returning is not setting up. When every step is behind them the six panels are
  // noise in front of the thing they came for, so they collapse into one line they can
  // reopen. <details> rather than state, so it still works with scripting off.
  const settled = steps.every((x) => x.done);

  return (
    <>
      <div className="dRail">
        {steps.map((x) => (
          <span key={x.n} className={`dPip ${x.done ? "done" : ""} ${x.n === current && !x.done ? "now" : ""}`}>
            {x.done ? "✓" : x.n} {x.label}
          </span>
        ))}
      </div>

      <div className="dHead">
        <span className="dMono">{account}</span>
        <span className="dDim">{formatUnits(s.stt, 18).slice(0, 6)} STT</span>
      </div>

      {err && <p className="dErr">{err}</p>}
      {tx && (
        <p className="dTx">
          {tx.what} sent — <a href={`${EXPLORER}/tx/${tx.hash}`} target="_blank" rel="noreferrer">{tx.hash.slice(0, 18)}…</a>
        </p>
      )}

      {settled && (
        <p className="dSetUp">
          <span className="dLive"><i aria-hidden="true" />Set up and enrolled.</span>
          Your policy is live and Ballast is watching your windows. Your history is below.
        </p>
      )}

      <StepGroup collapsed={settled}>
      {/* 02 */}
      <Step n="02" title="Get test dollars" done={steps[1].done}
        why="tUSDC is the collateral Ballast spends on premium. The faucet caps each call at 10,000, but the cap is per call, not per day.">
        <Row k="Your balance" v={`${usd(s.tusdc)} tUSDC`} />
        <button className="dBtn" disabled={!!busy}
          onClick={() => send("Faucet", (w) => w.writeContract({
            address: ADDR.tusdc as Address, abi: erc20, functionName: "faucet",
            args: [10_000_000_000n], gas: GAS.faucet, chain: somniaTestnet, account: account!,
          }))}>
          {busy === "Faucet" ? "Confirming…" : "Mint 10,000 tUSDC"}
        </button>
      </Step>

      {/* 03 */}
      <Step n="03" title="Get test ETH" done={steps[2].done}
        why="Ballast covers exposure it can measure you holding, so you need to actually hold something. Testnet WETH is openly mintable — one transaction, no approval, and it never touches the order book.">
        <Row k="You hold" v={`${formatUnits(s.weth, 18).slice(0, 8)} WETH`} />
        <Row k="Ballast measures" v={s.priceable ? `${usd(exposure)} tUSDC of exposure` : "unpriceable right now"} />
        <button className="dBtn" disabled={!!busy}
          onClick={() => send("Mint WETH", (w) => w.writeContract({
            address: WETH, abi: erc20, functionName: "mint",
            args: [account!, 10n ** 18n], gas: GAS.mint, chain: somniaTestnet, account: account!,
          }))}>
          {busy === "Mint WETH" ? "Confirming…" : "Mint 1 test ETH"}
        </button>
        <a className="dBtn ghost" href="https://dreamdex.xyz" target="_blank" rel="noreferrer">Buy on dreamDEX instead</a>
        <p className="dNote">
          Buying on the spot pool works too, but keep it to one book level. The visible ask side
          is about $955 deep, and taking all of it leaves the book one-sided — at which point
          Ballast can no longer price your exposure and reads it as zero.
        </p>
        {!s.priceable && s.weth > 0n && (
          <div className="dState">
            <h4>Exposure is unpriceable right now</h4>
            <dl>
              <dt>What is true</dt><dd>You hold {formatUnits(s.weth, 18).slice(0, 8)} WETH.</dd>
              <dt>What Ballast sees</dt><dd>No two-sided book to price against, so exposure reads zero.</dd>
              <dt>What happens next</dt><dd>This window is skipped. The next one will almost certainly price.</dd>
            </dl>
          </div>
        )}
      </Step>

      {/* 04 */}
      <Step n="04" title="Deposit collateral" done={steps[3].done}
        why="Two transactions, shown as two. Approving and depositing are separate on chain and hiding that behind one spinner would be a lie about what you are signing.">
        <Row k="In the vault" v={`${usd(s.collateral)} tUSDC`} />
        <Row k="Approved" v={`${usd(s.allowance)} tUSDC`} />
        {s.allowance < 1_000_000_000n ? (
          <button className="dBtn" disabled={!!busy}
            onClick={() => send("Approve", (w) => w.writeContract({
              address: ADDR.tusdc as Address, abi: erc20, functionName: "approve",
              args: [ADDR.vault as Address, 1_000_000_000_000n], gas: GAS.approve, chain: somniaTestnet, account: account!,
            }))}>
            {busy === "Approve" ? "Confirming…" : "1 of 2 · Approve tUSDC"}
          </button>
        ) : (
          <button className="dBtn" disabled={!!busy || s.tusdc === 0n}
            onClick={() => send("Deposit", (w) => w.writeContract({
              address: ADDR.vault as Address, abi: vaultAbi, functionName: "deposit",
              args: [s.tusdc < 1_000_000_000n ? s.tusdc : 1_000_000_000n], gas: GAS.deposit, chain: somniaTestnet, account: account!,
            }))}>
            {busy === "Deposit" ? "Confirming…" : "2 of 2 · Deposit 1,000 tUSDC"}
          </button>
        )}
      </Step>

      {/* 05 */}
      <Step n="05" title="Set the load line" done={steps[4].done}
        why="How deep a fall you want made whole, and the most you will pay for it per window. That is the whole of the policy.">
        <label className="dDial">
          <span className="dDialTop">
            <span>Make whole at</span>
            <b>{bps} bps</b>
          </span>
          <input type="range" min={50} max={500} step={10} value={bps}
            onChange={(e) => setBps(Number(e.target.value))} />
          <span className="dDialFoot">
            A {(bps / 100).toFixed(2)}% fall is covered in full
            {s.priceable && exposure > 0n
              ? ` · about ${((Number(exposure) / 1e6) * bps / 10_000).toFixed(2)} tUSDC of cover on your position`
              : ""}
          </span>
        </label>
        <Row k="Premium ceiling" v="300 bps per window" />
        <button className="dBtn" disabled={!!busy}
          onClick={() => send("Set policy", (w) => w.writeContract({
            address: ADDR.vault as Address, abi: vaultAbi, functionName: "setPolicy",
            args: [bps, 300, 2_000_000_000n, BigInt(Math.floor(Date.now() / 1000) + 30 * 86_400)],
            gas: GAS.setPolicy, chain: somniaTestnet, account: account!,
          }))}>
          {busy === "Set policy" ? "Confirming…" : policyActive ? "Update the load line" : "Set the load line"}
        </button>
      </Step>

      {/* 06 */}
      <Step n="06" title="Enrol" done={steps[5].done}
        why="Joining the cursor set is what puts you in front of the callback. From here Ballast reacts in the same block every window opens.">
        {s.enrolled ? (
          <>
            <p className="dLive"><i aria-hidden="true" />Watching your windows.</p>
            <button className="dBtn ghost" disabled={!!busy}
              onClick={() => send("Leave", (w) => w.writeContract({
                address: ADDR.engine as Address, abi: engineAbi, functionName: "withdrawEnrolment",
                args: [], gas: GAS.enrol, chain: somniaTestnet, account: account!,
              }))}>Leave the set</button>
          </>
        ) : (
          <button className="dBtn" disabled={!!busy}
            onClick={() => send("Enrol", (w) => w.writeContract({
              address: ADDR.engine as Address, abi: engineAbi, functionName: "enrol",
              args: [], gas: GAS.enrol, chain: somniaTestnet, account: account!,
            }))}>
            {busy === "Enrol" ? "Confirming…" : "Enrol"}
          </button>
        )}
      </Step>

      </StepGroup>

      {/* Always reachable, from anywhere, in one action. */}
      <div className="dExit">
        <h3>Leaving</h3>
        <p className="dWhy">
          Both of these are one action and neither can be blocked or delayed by us.
          <strong> revoke()</strong> stops new cover immediately; cover already open runs to
          settlement and pays out to you as normal.
        </p>
        <Row k="Withdrawable now" v={`${usd(s.free)} tUSDC`} />
        <Row k="Held against open cover" v={`${usd(s.reserved)} tUSDC`} />
        <div className="dExitRow">
          <button className="dBtn ghost" disabled={!!busy}
            onClick={() => send("Revoke", (w) => w.writeContract({
              address: ADDR.vault as Address, abi: vaultAbi, functionName: "revoke",
              args: [], gas: GAS.revoke, chain: somniaTestnet, account: account!,
            }))}>Revoke the policy</button>
          <button className="dBtn ghost" disabled={!!busy || s.free === 0n}
            onClick={() => send("Withdraw", (w) => w.writeContract({
              address: ADDR.vault as Address, abi: vaultAbi, functionName: "withdraw",
              args: [s.free], gas: GAS.withdraw, chain: somniaTestnet, account: account!,
            }))}>Withdraw {usd(s.free)} tUSDC</button>
        </div>
      </div>
    </>
  );
}

/** Collapsed for a returning account, open for one still setting up. */
function StepGroup({ collapsed, children }: { collapsed: boolean; children: React.ReactNode }) {
  if (!collapsed) return <>{children}</>;
  return (
    <details className="dSteps">
      <summary>Show the six setup steps</summary>
      {children}
    </details>
  );
}

function Step({ n, title, why, done, children }: {
  n: string; title: string; why: string; done: boolean; children: React.ReactNode;
}) {
  return (
    <section className={`dStep ${done ? "done" : ""}`}>
      <div className="dStepHead">
        <span className="dStepN">{n}</span>
        <h3>{title}</h3>
        {done && <span className="dDone">done</span>}
      </div>
      <p className="dWhy">{why}</p>
      {children}
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <p className="dRow"><span>{k}</span><b>{v}</b></p>;
}
