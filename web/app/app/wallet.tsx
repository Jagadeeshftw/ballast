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

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
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
    if (!p) return;
    // Reconnect silently if the wallet already has this site authorised, so moving between
    // views — or reloading — does not demand another prompt.
    (async () => {
      try {
        const accs = (await p.request({ method: "eth_accounts" })) as Address[];
        if (accs?.[0]) {
          setAccount(accs[0]);
          const cid = (await p.request({ method: "eth_chainId" })) as string;
          setChainOk(parseInt(cid, 16) === somniaTestnet.id);
        }
      } catch { /* not authorised yet */ }
    })();
    const onAccounts = (a: unknown) => setAccount(((a as string[])[0] as Address) ?? null);
    const onChain = (c: unknown) => setChainOk(parseInt(c as string, 16) === somniaTestnet.id);
    p.on?.("accountsChanged", onAccounts);
    p.on?.("chainChanged", onChain);
    return () => { p.removeListener?.("accountsChanged", onAccounts); p.removeListener?.("chainChanged", onChain); };
  }, []);

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
  }, []);

  const refresh = useCallback(async () => { if (account) await read(account); }, [account, read]);
  useEffect(() => { if (account) read(account); else setS(null); }, [account, read]);

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
      setAccount(accs[0]);
    } catch (e) { setErr(explain(e)); }
    finally { setConnecting(false); }
  }, [provider, switchChain]);

  /** Local only: EIP-1193 has no disconnect. Returns the page to its public view. */
  const disconnect = useCallback(() => { setAccount(null); setS(null); setErr(null); setTx(null); }, []);

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
    ready, hasProvider: !!provider, account, chainOk, connecting, s, busy, err, tx,
    connect, disconnect, switchChain, refresh, send, clearTx: () => setTx(null),
  }), [ready, provider, account, chainOk, connecting, s, busy, err, tx, connect, disconnect, switchChain, refresh, send]);

  return <WalletCtx.Provider value={value}>{children}</WalletCtx.Provider>;
}
