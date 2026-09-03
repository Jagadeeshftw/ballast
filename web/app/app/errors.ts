import { decodeErrorResult, parseAbi } from "viem";

/**
 * Every failure path in these contracts is a typed custom error carrying its arguments, so a
 * failed transaction can say what actually happened instead of "something went wrong".
 *
 * That is the whole point of this file: `InsufficientFreeBalance(1000000, 115)` becomes a
 * sentence with both numbers in it. Rendering the error NAME would be barely better than
 * rendering nothing.
 */

const ERRORS = parseAbi([
  // BallastVault
  "error ZeroAddress()",
  "error ZeroAmount()",
  "error NotEngine()",
  "error InsufficientFreeBalance(uint256 requested, uint256 available)",
  "error InsufficientReservation(uint256 requested, uint256 reserved)",
  "error NoActivePolicy()",
  "error PolicyExpired(uint64 expiry, uint256 nowTs)",
  "error MakeWholeOutOfRange(uint16 given, uint16 max)",
  "error PremiumCapOutOfRange(uint16 given, uint16 max)",
  "error PolicyDurationTooShort(uint64 given, uint64 earliest)",
  "error NotionalCapExceeded(uint256 wanted, uint256 cap, uint256 used)",
  "error PremiumCapExceeded(uint256 premium, uint256 cap, uint256 exposure)",
  // HedgeEngine
  "error AlreadyEnrolled()",
  "error NotEnrolled()",
  "error NotEligible()",
]);

const usd = (v: bigint) => `${(Number(v) / 1e6).toLocaleString("en-GB", { maximumFractionDigits: 6 })} tUSDC`;
const utc = (v: bigint) =>
  new Date(Number(v) * 1000).toISOString().replace("T", " ").slice(0, 19) + " UTC";

/** A sentence a person can act on, with the contract's own numbers in it. */
function sentence(name: string, args: readonly unknown[]): string {
  const a = args as readonly bigint[];
  switch (name) {
    case "InsufficientFreeBalance":
      return `You asked to withdraw ${usd(a[0])} but only ${usd(a[1])} is unreserved. Cover that is still open holds the rest until it settles.`;
    case "InsufficientReservation":
      return `The engine tried to spend ${usd(a[0])} against a reservation of ${usd(a[1])}.`;
    case "NoActivePolicy":
      return "There is no active policy on this account. Set a load line first — that is what authorises Ballast to buy anything.";
    case "PolicyExpired":
      return `The policy expired at ${utc(a[0])}. Set a new one to resume cover.`;
    case "MakeWholeOutOfRange":
      return `A make-whole point of ${a[0]} bps is outside the allowed range; the maximum is ${a[1]} bps.`;
    case "PremiumCapOutOfRange":
      return `A premium ceiling of ${a[0]} bps is outside the allowed range; the maximum is ${a[1]} bps.`;
    case "PolicyDurationTooShort":
      return `That expiry is too soon. The earliest allowed is ${utc(a[1])}.`;
    case "NotionalCapExceeded":
      return `That window wanted ${usd(a[0])} of notional against a per-window cap of ${usd(a[1])}, with ${usd(a[2])} already used.`;
    case "PremiumCapExceeded":
      return `The premium of ${usd(a[0])} exceeds your ceiling of ${usd(a[1])} on exposure of ${usd(a[2])}.`;
    case "ZeroAmount":
      return "The amount was zero. Nothing to do.";
    case "ZeroAddress":
      return "A zero address was supplied.";
    case "NotEngine":
      return "Only an approved engine can call that.";
    case "AlreadyEnrolled":
      return "This account is already enrolled — Ballast is already watching your windows.";
    case "NotEligible":
      return "Not eligible to enrol yet: enrolling needs an active policy and enough free collateral to pay for a window of cover.";
    case "NotEnrolled":
      return "This account is not enrolled, so there is nothing to withdraw from.";
    default:
      return name;
  }
}

/** Pull the revert data out of whatever shape the wallet or node handed back. */
function revertData(err: unknown): `0x${string}` | null {
  const seen = new Set<unknown>();
  const walk = (o: unknown): `0x${string}` | null => {
    if (!o || typeof o !== "object" || seen.has(o)) return null;
    seen.add(o);
    const rec = o as Record<string, unknown>;
    for (const k of ["data", "raw"]) {
      const v = rec[k];
      if (typeof v === "string" && v.startsWith("0x") && v.length >= 10) return v as `0x${string}`;
      if (v && typeof v === "object") { const r = walk(v); if (r) return r; }
    }
    for (const v of Object.values(rec)) {
      if (v && typeof v === "object") { const r = walk(v); if (r) return r; }
    }
    return null;
  };
  return walk(err);
}

export function explain(err: unknown): string {
  // A user closing the wallet prompt is not a failure worth a red panel.
  const msg = (err as { shortMessage?: string; message?: string })?.shortMessage
    ?? (err as { message?: string })?.message ?? "";
  if (/user rejected|denied transaction|rejected the request/i.test(msg)) {
    return "You dismissed the wallet prompt. Nothing was sent.";
  }
  const data = revertData(err);
  if (data) {
    try {
      const d = decodeErrorResult({ abi: ERRORS, data });
      return sentence(d.errorName, (d.args ?? []) as readonly unknown[]);
    } catch {
      /* not one of ours — fall through to the wallet's own words */
    }
  }
  if (/insufficient funds/i.test(msg)) {
    return "Not enough STT to pay for gas. Claim from a faucet and try again.";
  }
  return msg || "The transaction failed and the node returned no reason.";
}
