import { parseAbi, type Address } from "viem";

/** Shared on-chain surface. Extracted verbatim from the wizard — proven, not rewritten. */

export const WETH: Address = "0x4d8E02BBfCf205828A8352Af4376b165E123D7b0";

/* Somnia charges far more than a fork does for new accounts and new storage: a first deposit
   measured 1,149,275 gas live against 48,343 on a fork, and a brand-new account's first
   transaction measured 1,379,707. Wallet estimation is not to be trusted with that, and the
   cost of over-provisioning is a fraction of a cent, so every limit is roughly double the
   measured cold path. A transaction that dies at the signature prompt is the most damaging
   thing that can happen in a demo. */
export const GAS = {
  faucet: 2_800_000n, mint: 2_800_000n, approve: 600_000n, deposit: 2_600_000n,
  setPolicy: 700_000n, enrol: 1_400_000n, revoke: 400_000n, withdraw: 500_000n,
  // Measured, not guessed: settle() estimates 2,053,708 to 2,796,559 across the live
  // backlog, so 2,400,000 -- which is what this said before the backlog was costed -- would
  // have run out of gas on the majority of positions. Doubled from the measured maximum.
  settle: 5_600_000n, settleMany: 8_000_000n, topUp: 400_000n,
} as const;

export const erc20 = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function faucet(uint256)",
  "function mint(address,uint256)",
]);

export const vaultAbi = parseAbi([
  "function deposit(uint256)",
  "function withdraw(uint256)",
  "function revoke()",
  "function setPolicy(uint16,uint16,uint256,uint64)",
  "function collateralOf(address) view returns (uint256)",
  "function freeBalanceOf(address) view returns (uint256)",
  "function reservedOf(address) view returns (uint256)",
  "function policyOf(address) view returns (bool,uint16,uint16,uint64,uint256)",
]);

export const engineAbi = parseAbi([
  "function enrol()",
  "function withdrawEnrolment()",
  "function isEnrolled(address) view returns (bool)",
  "function settle(address,bytes32)",
  // settleMany batches USERS for ONE market, not markets for one user, so it cannot close a
  // single account's backlog in one call. Kept for completeness; the UI settles per position.
  "function settleMany(address[],bytes32) returns (uint256,uint256)",
  "function topUp() payable",
]);

export const sourceAbi = parseAbi([
  "function priceOf(bytes32) view returns (uint256,bool)",
  "function assetKeyFor(string) pure returns (bytes32)",
]);

export const FAUCETS = [
  ["Official Somnia faucet", "https://testnet.somnia.network/"],
  ["Google Cloud", "https://cloud.google.com/application/web3/faucet/somnia/shannon"],
  ["Stakely", "https://stakely.io/faucet/somnia-testnet-stt"],
] as const;
