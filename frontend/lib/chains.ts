import { createPublicClient, formatUnits, http, defineChain } from 'viem';
import { base, baseSepolia } from 'viem/chains';

/**
 * Arc is Circle's USDC-native EVM L1. Gas is paid in USDC itself, so there is
 * no separate native token to hold. USDC is exposed at a fixed precompile-style
 * address (same value on mainnet and testnet) with the standard 6-decimal
 * ERC-20 interface used everywhere else in this codebase.
 * Source: https://docs.arc.io/arc/references/contract-addresses
 *         https://docs.arc.io/arc/references/connect-to-arc
 */
export const arc = defineChain({
  id: 5042,
  name: 'Arc',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_ARC_RPC_URL || 'https://rpc.mainnet.arc.io'] },
  },
  blockExplorers: {
    default: { name: 'Arc Explorer', url: 'https://arc-scan.org' },
  },
});

export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL || 'https://rpc.testnet.arc.io'] },
  },
  blockExplorers: {
    default: { name: 'Arc Testnet Explorer', url: 'https://explorer.testnet.arc.io' },
  },
  testnet: true,
});

/** The fixed USDC address on Arc — identical on mainnet and testnet. */
const ARC_USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const;

export type ChainKey = 'base' | 'arc';

export type ChainConfig = {
  key: ChainKey;
  chain: typeof base | typeof arc;
  /** Chain used when deploying/testing against a testnet instead. */
  testnetChain: typeof baseSepolia | typeof arcTestnet;
  displayName: string;
  usdcAddress: `0x${string}`;
  usdcDecimals: number;
  airtimeContractAddress: `0x${string}` | undefined;
  blockExplorerUrl: string;
  /** Whether depositWithPermit (EIP-2612 gasless approval) is known to work on this chain. */
  supportsPermit: boolean;
  /**
   * True when USDC is also the chain's native gas token (Arc), so a single
   * balance has to cover both the payment amount and the network fee. False
   * when gas is paid in a separate native asset (Base pays gas in ETH).
   */
  usdcIsGasToken: boolean;
};

// Base Mainnet USDC — https://developers.circle.com/stablecoins/usdc-contract-addresses
const BASE_USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;

export const CHAINS: Record<ChainKey, ChainConfig> = {
  base: {
    key: 'base',
    chain: base,
    testnetChain: baseSepolia,
    displayName: 'Base',
    usdcAddress: BASE_USDC_ADDRESS,
    usdcDecimals: 6,
    airtimeContractAddress: process.env.NEXT_PUBLIC_AIRTIME_CONTRACT_ADDRESS_BASE as `0x${string}` | undefined
      // fall back to the original single-chain env var so existing deployments keep working
      ?? (process.env.NEXT_PUBLIC_AIRTIME_CONTRACT_ADDRESS as `0x${string}` | undefined),
    blockExplorerUrl: 'https://basescan.org',
    supportsPermit: true,
    usdcIsGasToken: false,
  },
  arc: {
    key: 'arc',
    chain: arc,
    testnetChain: arcTestnet,
    displayName: 'Arc',
    usdcAddress: ARC_USDC_ADDRESS,
    usdcDecimals: 6,
    airtimeContractAddress: process.env.NEXT_PUBLIC_AIRTIME_CONTRACT_ADDRESS_ARC as `0x${string}` | undefined,
    blockExplorerUrl: 'https://arc-scan.org',
    // Confirmed: Arc's USDC implements EIP-2612 permit() (domain name "USDC",
    // version "2"), same as Base. Circle's own arc-node repo demonstrates it:
    // https://github.com/circlefin/arc-node/issues/164
    supportsPermit: true,
    usdcIsGasToken: true,
  },
};

export const DEFAULT_CHAIN_KEY: ChainKey = 'base';

export function getChainConfigById(chainId: number | undefined): ChainConfig {
  if (chainId === arc.id) return CHAINS.arc;
  return CHAINS.base;
}

export function getChainConfig(key: ChainKey): ChainConfig {
  return CHAINS[key];
}

export const SUPPORTED_CHAIN_IDS = Object.values(CHAINS).map((c) => c.chain.id);

/**
 * Conservative gas-limit estimate for a `depositWithPermit` call: ecrecover +
 * permit's nonce/allowance writes + transferFrom + our own order accounting
 * writes + event. Arc's own guidance targets ~$0.001 for a plain ERC-20
 * transfer (https://docs.arc.io/arc/references/gas-and-fees); depositWithPermit
 * does meaningfully more work than a transfer, so this is sized generously
 * rather than measured against a live deployment.
 */
const DEPOSIT_WITH_PERMIT_GAS_LIMIT = 220_000n;

/** Safety margin on top of the estimated fee to absorb price movement between estimate and broadcast. */
const GAS_ESTIMATE_SAFETY_MARGIN = 1.3;

/** Static fallback reserve (in whole USDC) used only if live fee estimation fails. */
const FALLBACK_GAS_RESERVE_USDC = 0.05;

/**
 * How much USDC balance to hold back for network fees before comparing
 * against a payment amount. Zero on chains where gas is paid in a separate
 * native asset (Base). On Arc, gas and the payment draw from the same USDC
 * balance, so per Arc's own dApp guidance we query live EIP-1559 fee data
 * and reserve for "value transfers and gas costs combined" rather than
 * hardcoding a fee: https://docs.arc.io/arc/references/gas-and-fees
 */
export async function estimateGasReserveUsdc(config: ChainConfig): Promise<number> {
  if (!config.usdcIsGasToken) return 0;

  try {
    const publicClient = createPublicClient({ chain: config.chain, transport: http() });
    const fees = await publicClient.estimateFeesPerGas();
    const feePerGas = fees.maxFeePerGas ?? (await publicClient.getGasPrice());
    const reserveWei = feePerGas * DEPOSIT_WITH_PERMIT_GAS_LIMIT;
    // Native gas accounting on Arc uses 18 decimals for USDC (same value as
    // the 6-decimal ERC-20 view, just scaled differently) — see
    // https://docs.arc.io/arc/references/connect-to-arc
    const reserveUsdc = Number(formatUnits(reserveWei, config.chain.nativeCurrency.decimals));
    return reserveUsdc * GAS_ESTIMATE_SAFETY_MARGIN;
  } catch (err) {
    console.warn('[chains] gas reserve estimation failed, using static fallback', err);
    return FALLBACK_GAS_RESERVE_USDC;
  }
}
