"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  createPublicClient, createWalletClient, custom, http, parseAbi,
  type Address, type EIP1193Provider,
} from "viem";
import { somniaTestnet } from "viem/chains";
import { useRouter } from "next/navigation";
import { ADDR, EXPLORER, RPC } from "@/lib/chain";
import { explain } from "./errors";
import { WETH, erc20, vaultAbi, engineAbi, sourceAbi } from "./onchain";

/**
 * One wallet connection for the whole dashboard.
 *
 * Lifted out of the six-step wizard unchanged in behaviour: the same EIP-1193 connect, the
 * same add-then-switch fallback because wallets do not ship Somnia Shannon, the same decoded
 * errors, the same explicit gas limits. What is new is only that it lives above the routes,
 * so a connection survives moving between views.
 */

export const pub = createPublicClient({ chain: somniaTestnet, transport: http(RPC) });

export type Snapshot = {
  stt: bigint; tusdc: bigint; weth: bigint; allowance: bigint;
  collateral: bigint; free: bigint; reserved: bigint;
  policy: readonly [boolean, number, number, bigint, bigint];
  enrolled: boolean; ethPrice: bigint; priceable: boolean;
};

type Ctx = {
  ready: boolean;
  /** True only once the initial account check has RESOLVED. `ready` says the provider has
   *  been looked for; this says we actually know whether anyone is connected. */
  settled: boolean;
  /** The account read failed. Distinct from "not read yet": we asked and could not find
   *  out, which is a KNOWN state and must not be rendered as an unresolved one. */
  sErr: boolean;
  hasProvider: boolean;
  account: Address | null;
  chainOk: boolean;
  connecting: boolean;
  s: Snapshot | null;
  busy: string | null;
  err: string | null;
  tx: { hash: string; what: string } | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchChain: () => Promise<void>;
  refresh: () => Promise<void>;
  send: (what: string, run: (w: ReturnType<typeof createWalletClient>) => Promise<`0x${string}`>) => Promise<void>;
  clearTx: () => void;
};

const WalletCtx = createContext<Ctx | null>(null);

export function useWallet() {
  const c = useContext(WalletCtx);
  if (!c) throw new Error("useWallet outside WalletProvider");
  return c;
}

/* Remembering an explicit disconnect. localStorage rather than state because the whole point
   is surviving a reload, and it is read only inside effects and handlers — never during
   render — so the server-rendered shell and the no-JS render are untouched. Every access is
   guarded: a private window can throw on access alone. */
const DISCONNECTED = "ballast.wallet.disconnected";
const userDisconnected = () => {
  try { return localStorage.getItem(DISCONNECTED) === "1"; } catch { return false; }
};
const markDisconnected = () => { try { localStorage.setItem(DISCONNECTED, "1"); } catch { /* private mode */ } };
const clearDisconnected = () => { try { localStorage.removeItem(DISCONNECTED); } catch { /* private mode */ } };

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [settled, setSettled] = useState(false);
  const [sErr, setSErr] = useState(false);

  /* Paired with the inline script in the layout: it holds the panels' shape from parse until
     React can answer, and this releases it. Every path that sets `settled` goes through here
     so the two can never disagree. */
  const settle = useCallback(() => {
    setSettled(true);
    try { document.documentElement.removeAttribute("data-wpend"); } catch { /* no DOM */ }
  }, []);
  const [provider, setProvider] = useState<EIP1193Provider | null>(null);
  const [account, setAccount] = useState<Address | null>(null);
  const [chainOk, setChainOk] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [s, setS] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tx, setTx] = useState<{ hash: string; what: string } | null>(null);

  useEffect(() => {
    const p = (globalThis as { ethereum?: EIP1193Provider }).ethereum ?? null;
    setProvider(p);
    setReady(true);
    /* With no provider there is nothing to wait for: the answer is already known. */
    if (!p) { settle(); return; }
    /* Reconnect silently if the wallet already has this site authorised, so moving between
       views does not demand another prompt — UNLESS the reader disconnected on purpose.
       MetaMask keeps the site authorised at the wallet level and a page cannot revoke that,
       so `eth_accounts` keeps returning the address after a disconnect. Without remembering
       the intent, an explicit user action was silently undone on the next reload. */
    (async () => {
      /* A reader who deliberately disconnected is a KNOWN state, not an unknown one --
         settle immediately rather than holding the panels in a skeleton forever. */
      if (userDisconnected()) { settle(); return; }
      try {
        const accs = (await p.request({ method: "eth_accounts" })) as Address[];
        if (accs?.[0]) {
          setAccount(accs[0]);
          const cid = (await p.request({ method: "eth_chainId" })) as string;
          setChainOk(parseInt(cid, 16) === somniaTestnet.id);
        }
      } catch { /* not authorised yet */ }
      finally {
        /* Only now is the connection status actually known. `setReady(true)` above fires
           synchronously, before this request resolves -- so anything branching on `ready`
           alone was rendering "not connected" during the gap and correcting itself a moment
           later. On the panel whose job is to be accurate about ownership, that meant telling
           a connected reader they had no cover. */
        settle();
      }
    })();
    /* The wallet switching accounts must not resurrect a session the reader ended either. */
    const onAccounts = (a: unknown) => {
      if (userDisconnected()) return;
      setAccount(((a as string[])[0] as Address) ?? null);
    };
    const onChain = (c: unknown) => setChainOk(parseInt(c as string, 16) === somniaTestnet.id);
    p.on?.("accountsChanged", onAccounts);
    p.on?.("chainChanged", onChain);
    return () => { p.removeListener?.("accountsChanged", onAccounts); p.removeListener?.("chainChanged", onChain); };
  }, [settle]);

  const read = useCallback(async (who: Address) => {
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
    setS({ stt, tusdc, weth, allowance, collateral, free, reserved,
      policy: policy as Snapshot["policy"], enrolled, ethPrice: price[0], priceable: price[1] });
    setSErr(false);
  }, []);

  const refresh = useCallback(async () => { if (account) await read(account); }, [account, read]);
  /* An unhandled rejection here used to leave `s` null forever, which was survivable only
     because the panels rendered null as a negative. Now that they hold an indeterminate
     state instead, a failed read has to be reported as a failure -- otherwise an RPC outage
     turns into a skeleton that never resolves, which is a worse lie than the one it
     replaced. Asked-and-could-not-find-out is a known state. */
  useEffect(() => {
    if (!account) { setS(null); setSErr(false); return; }
    let live = true;
    read(account).catch(() => { if (live) setSErr(true); });
    return () => { live = false; };
  }, [account, read]);

  const switchChain = useCallback(async () => {
    if (!provider) return;
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: `0x${somniaTestnet.id.toString(16)}` }] });
      setChainOk(true);
    } catch {
      // Wallets do not ship Somnia Shannon, so offer to add it rather than only to switch.
      try {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: `0x${somniaTestnet.id.toString(16)}`,
            chainName: somniaTestnet.name,
            nativeCurrency: somniaTestnet.nativeCurrency,
            rpcUrls: [RPC], blockExplorerUrls: [EXPLORER],
          }],
        });
        setChainOk(true);
      } catch (e) { setErr(explain(e)); }
    }
  }, [provider]);

  const connect = useCallback(async () => {
    if (!provider) return;
    setErr(null); setConnecting(true);
    try {
      const accs = (await provider.request({ method: "eth_requestAccounts" })) as Address[];
      const cid = (await provider.request({ method: "eth_chainId" })) as string;
      if (parseInt(cid, 16) !== somniaTestnet.id) { setChainOk(false); await switchChain(); }
      else setChainOk(true);
      clearDisconnected();   // connecting is the deliberate act that undoes a disconnect
      setAccount(accs[0]);
    } catch (e) { setErr(explain(e)); }
    finally { setConnecting(false); }
  }, [provider, switchChain]);

  /** Local only: EIP-1193 has no disconnect, so the intent is recorded here and honoured by
   *  the silent-reconnect path above. Returns the page to its public view. */
  const disconnect = useCallback(() => {
    markDisconnected();
    setAccount(null); setS(null); setErr(null); setTx(null);
  }, []);

  /**
   * The one funnel every write in the dashboard goes through.
   *
   * Two things here are load-bearing.
   *
   * `waitForTransactionReceipt` RESOLVES for a reverted transaction -- it only rejects if the
   * receipt never arrives. Without the status check below, a reverted deposit set no error,
   * cleared the busy state and left a transaction link on screen: the interface said the money
   * had moved when the chain said it had not. This is the same bug that was fixed in the
   * settle runner; it was still live here.
   *
   * And a confirmed write must be reflected in the SERVER-rendered figures, not just in the
   * client's wallet state. `read()` refreshes what this provider holds; the vault balance, the
   * positions table and the status band are rendered on the server and would otherwise keep
   * showing pre-write values until a manual reload -- someone would see their own deposit
   * missing. `router.refresh()` re-renders those against the chain as it is now.
   */
  const send = useCallback(async (what: string, run: (w: ReturnType<typeof createWalletClient>) => Promise<`0x${string}`>) => {
    if (!provider || !account) return;
    setBusy(what); setErr(null); setTx(null);
    try {
      const wallet = createWalletClient({ account, chain: somniaTestnet, transport: custom(provider) });
      const hash = await run(wallet);
      setTx({ hash, what });
      const receipt = await pub.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        /* A receipt reports `reverted` for an out-of-gas too, so status alone cannot tell them
           apart -- and they are different failures with different fixes. Sending someone to
           look for a revert reason that does not exist points them the wrong way. When every
           unit of the limit was consumed, it ran out; a revert leaves gas on the table. */
        const sent = await pub.getTransaction({ hash }).catch(() => null);
        const outOfGas = !!sent && receipt.gasUsed >= sent.gas;
        setErr(
          outOfGas
            ? `${what} ran out of gas — it used all ${receipt.gasUsed.toLocaleString("en-GB")} ` +
              `units it was given, so it was cut off partway rather than rejected. Nothing changed ` +
              `on chain and there is no revert reason to look up, because it did not revert. This ` +
              `is a limit we set too low; please report it.`
            : `${what} was mined but reverted, so nothing changed on chain. The transaction is on ` +
              `the explorer with the revert reason; gas for it was still spent.`,
        );
        return;
      }
      await read(account);
      router.refresh();
    } catch (e) { setErr(explain(e)); }
    finally { setBusy(null); }
  }, [provider, account, read, router]);

  const value = useMemo<Ctx>(() => ({
    ready, settled, sErr, hasProvider: !!provider, account, chainOk, connecting, s, busy, err, tx,
    connect, disconnect, switchChain, refresh, send, clearTx: () => setTx(null),
  }), [ready, settled, sErr, provider, account, chainOk, connecting, s, busy, err, tx, connect, disconnect, switchChain, refresh, send]);

  return <WalletCtx.Provider value={value}>{children}</WalletCtx.Provider>;
}
