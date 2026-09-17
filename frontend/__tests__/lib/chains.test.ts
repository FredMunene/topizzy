import { formatUnits } from 'viem';

// Mock only createPublicClient — keep every other viem export (defineChain,
// formatUnits, http, chain definitions) real so the chain configs themselves
// stay accurate.
const mockEstimateFeesPerGas = jest.fn();
const mockGetGasPrice = jest.fn();

jest.mock('viem', () => {
  const actual = jest.requireActual('viem');
  return {
    ...actual,
    createPublicClient: jest.fn(() => ({
      estimateFeesPerGas: mockEstimateFeesPerGas,
      getGasPrice: mockGetGasPrice,
    })),
  };
});

import {
  CHAINS,
  arc,
  arcTestnet,
  getChainConfig,
  getChainConfigById,
  estimateGasReserveUsdc,
  SUPPORTED_CHAIN_IDS,
  DEFAULT_CHAIN_KEY,
} from '@/lib/chains';
import { base } from 'viem/chains';

const GAS_LIMIT = 220_000n; // DEPOSIT_WITH_PERMIT_GAS_LIMIT, mirrored here for expected-value math
const SAFETY_MARGIN = 1.3; // GAS_ESTIMATE_SAFETY_MARGIN
const FALLBACK_RESERVE = 0.05; // FALLBACK_GAS_RESERVE_USDC

function expectedReserve(feePerGasWei: bigint): number {
  const reserveWei = feePerGasWei * GAS_LIMIT;
  return Number(formatUnits(reserveWei, 18)) * SAFETY_MARGIN;
}

describe('CHAINS config', () => {
  it('defines base with USDC as a separate-from-gas asset and permit support', () => {
    expect(CHAINS.base.key).toBe('base');
    expect(CHAINS.base.chain.id).toBe(base.id);
    expect(CHAINS.base.usdcIsGasToken).toBe(false);
    expect(CHAINS.base.supportsPermit).toBe(true);
    expect(CHAINS.base.usdcDecimals).toBe(6);
    expect(CHAINS.base.blockExplorerUrl).toBe('https://basescan.org');
  });

  it('defines arc with USDC as the native gas token and permit support', () => {
    expect(CHAINS.arc.key).toBe('arc');
    expect(CHAINS.arc.chain.id).toBe(arc.id);
    expect(CHAINS.arc.usdcIsGasToken).toBe(true);
    expect(CHAINS.arc.supportsPermit).toBe(true);
    expect(CHAINS.arc.usdcDecimals).toBe(6);
    expect(CHAINS.arc.usdcAddress).toBe('0x3600000000000000000000000000000000000000');
    expect(CHAINS.arc.blockExplorerUrl).toBe('https://explorer.arc.io');
  });

  it('points base and arc at their respective testnet chains', () => {
    expect(CHAINS.base.testnetChain.id).not.toBe(CHAINS.base.chain.id);
    expect(CHAINS.arc.testnetChain).toBe(arcTestnet);
    expect(arcTestnet.id).toBe(5042002);
    expect(arcTestnet.testnet).toBe(true);
  });

  it('exposes the default chain key and the supported chain id list', () => {
    expect(DEFAULT_CHAIN_KEY).toBe('base');
    expect(SUPPORTED_CHAIN_IDS).toEqual(expect.arrayContaining([base.id, arc.id]));
    expect(SUPPORTED_CHAIN_IDS).toHaveLength(2);
  });
});

describe('airtimeContractAddress env fallback', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('uses NEXT_PUBLIC_AIRTIME_CONTRACT_ADDRESS_BASE when set', () => {
    process.env.NEXT_PUBLIC_AIRTIME_CONTRACT_ADDRESS_BASE = '0xBaseSpecific0000000000000000000000000001';
    process.env.NEXT_PUBLIC_AIRTIME_CONTRACT_ADDRESS = '0xLegacyFallback000000000000000000000000002';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { CHAINS: reloaded } = require('@/lib/chains');
    expect(reloaded.base.airtimeContractAddress).toBe('0xBaseSpecific0000000000000000000000000001');
  });

  it('falls back to the legacy NEXT_PUBLIC_AIRTIME_CONTRACT_ADDRESS when the chain-specific var is unset', () => {
    delete process.env.NEXT_PUBLIC_AIRTIME_CONTRACT_ADDRESS_BASE;
    process.env.NEXT_PUBLIC_AIRTIME_CONTRACT_ADDRESS = '0xLegacyFallback000000000000000000000000002';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { CHAINS: reloaded } = require('@/lib/chains');
    expect(reloaded.base.airtimeContractAddress).toBe('0xLegacyFallback000000000000000000000000002');
  });

  it('is undefined when neither env var is set', () => {
    delete process.env.NEXT_PUBLIC_AIRTIME_CONTRACT_ADDRESS_BASE;
    delete process.env.NEXT_PUBLIC_AIRTIME_CONTRACT_ADDRESS;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { CHAINS: reloaded } = require('@/lib/chains');
    expect(reloaded.base.airtimeContractAddress).toBeUndefined();
  });
});

describe('getChainConfigById', () => {
  it('returns the arc config for arc\'s chain id', () => {
    expect(getChainConfigById(arc.id)).toBe(CHAINS.arc);
  });

  it('returns the base config for base\'s chain id', () => {
    expect(getChainConfigById(base.id)).toBe(CHAINS.base);
  });

  it('falls back to base for undefined', () => {
    expect(getChainConfigById(undefined)).toBe(CHAINS.base);
  });

  it('falls back to base for an unrecognized chain id', () => {
    expect(getChainConfigById(999999)).toBe(CHAINS.base);
  });
});

describe('getChainConfig', () => {
  it('returns the config for "base"', () => {
    expect(getChainConfig('base')).toBe(CHAINS.base);
  });

  it('returns the config for "arc"', () => {
    expect(getChainConfig('arc')).toBe(CHAINS.arc);
  });
});

describe('estimateGasReserveUsdc', () => {
  beforeEach(() => {
    mockEstimateFeesPerGas.mockReset();
    mockGetGasPrice.mockReset();
  });

  it('returns 0 without touching the network when USDC is not the gas token (Base)', async () => {
    const reserve = await estimateGasReserveUsdc(CHAINS.base);
    expect(reserve).toBe(0);
    expect(mockEstimateFeesPerGas).not.toHaveBeenCalled();
    expect(mockGetGasPrice).not.toHaveBeenCalled();
  });

  it('estimates a reserve from live EIP-1559 fee data when maxFeePerGas is available (Arc)', async () => {
    const maxFeePerGas = 1_000_000_000n; // 1 gwei-equivalent
    mockEstimateFeesPerGas.mockResolvedValue({ maxFeePerGas });

    const reserve = await estimateGasReserveUsdc(CHAINS.arc);

    expect(reserve).toBeCloseTo(expectedReserve(maxFeePerGas), 10);
    expect(mockGetGasPrice).not.toHaveBeenCalled();
  });

  it('falls back to getGasPrice when maxFeePerGas is undefined', async () => {
    const gasPrice = 2_000_000_000n; // 2 gwei-equivalent
    mockEstimateFeesPerGas.mockResolvedValue({ maxFeePerGas: undefined });
    mockGetGasPrice.mockResolvedValue(gasPrice);

    const reserve = await estimateGasReserveUsdc(CHAINS.arc);

    expect(mockGetGasPrice).toHaveBeenCalledTimes(1);
    expect(reserve).toBeCloseTo(expectedReserve(gasPrice), 10);
  });

  it('falls back to a static reserve and logs a warning when fee estimation throws', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockEstimateFeesPerGas.mockRejectedValue(new Error('RPC unreachable'));

    const reserve = await estimateGasReserveUsdc(CHAINS.arc);

    expect(reserve).toBe(FALLBACK_RESERVE);
    expect(warnSpy).toHaveBeenCalledWith(
      '[chains] gas reserve estimation failed, using static fallback',
      expect.any(Error)
    );

    warnSpy.mockRestore();
  });

  it('falls back to a static reserve when getGasPrice also throws', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockEstimateFeesPerGas.mockResolvedValue({ maxFeePerGas: undefined });
    mockGetGasPrice.mockRejectedValue(new Error('RPC unreachable'));

    const reserve = await estimateGasReserveUsdc(CHAINS.arc);

    expect(reserve).toBe(FALLBACK_RESERVE);
    warnSpy.mockRestore();
  });
});
