const mockReadContract = jest.fn();

jest.mock('viem', () => {
  const actual = jest.requireActual('viem');
  return {
    ...actual,
    createPublicClient: jest.fn((config: unknown) => ({
      __config: config,
      readContract: (...args: unknown[]) => mockReadContract(...args),
    })),
  };
});

// normalizeSignature strips leading zeros from the whole raw string, so a
// signature that parses successfully can never actually have r === 0x0 — the
// leading zero digits would always be stripped first. The r-is-zero check in
// generatePermitSignature is defensive against a hypothetical parseSignature
// change, so this one case is tested by mocking parseSignature directly
// rather than by contorting an "impossible" real signature string.
jest.mock('@/lib/permit-utils', () => {
  const actual = jest.requireActual('@/lib/permit-utils');
  return { ...actual, parseSignature: jest.fn(actual.parseSignature) };
});

import { generatePermitSignature } from '@/lib/permit-signature';
import { createPublicClient } from 'viem';
import { base } from 'viem/chains';
import { parseSignature } from '@/lib/permit-utils';

const TOKEN_ADDRESS = '0xUSDC00000000000000000000000000000000001' as `0x${string}`;
const OWNER = '0xOwner000000000000000000000000000000001' as `0x${string}`;
const SPENDER = '0xSpender0000000000000000000000000000001' as `0x${string}`;

// r(64) + s(64) + v(2) — a well-formed 65-byte signature with nonzero r/s.
const VALID_SIG = ('0x' + 'a'.repeat(64) + 'b'.repeat(64) + '1b') as `0x${string}`;
const ZERO_S_SIG = ('0x' + 'a'.repeat(64) + '0'.repeat(64) + '1b') as `0x${string}`;
// Too short to parse as either 128 or 130 hex chars after normalisation.
const UNPARSEABLE_SIG = '0x' + 'a'.repeat(20);

function baseArgs(overrides: Record<string, unknown> = {}) {
  return {
    tokenAddress: TOKEN_ADDRESS,
    owner: OWNER,
    spender: SPENDER,
    value: '1000000',
    deadline: 9999999999,
    chainId: 8453,
    walletClient: { signTypedData: jest.fn().mockResolvedValue(VALID_SIG) },
    ...overrides,
  };
}

describe('generatePermitSignature', () => {
  beforeEach(() => {
    mockReadContract.mockReset().mockImplementation(({ functionName }: { functionName: string }) => {
      if (functionName === 'name') return Promise.resolve('USDC');
      if (functionName === 'nonces') return Promise.resolve(0n);
      throw new Error(`unexpected functionName: ${functionName}`);
    });
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  it('returns v/r/s/nonce/deadline on a clean sign', async () => {
    const result = await generatePermitSignature(baseArgs());
    expect(result).toMatchObject({
      v: 27,
      r: '0x' + 'a'.repeat(64),
      s: '0x' + 'b'.repeat(64),
      nonce: 0n,
      deadline: 9999999999,
    });
    expect(mockReadContract).toHaveBeenCalledTimes(2);
  });

  it('defaults to the Base chain when none is passed', async () => {
    await generatePermitSignature(baseArgs());
    expect(createPublicClient).toHaveBeenCalledWith(expect.objectContaining({ chain: base }));
  });

  it('uses the given chain when provided', async () => {
    const customChain = { id: 5042, name: 'Arc' };
    await generatePermitSignature(baseArgs({ chain: customChain }));
    expect(createPublicClient).toHaveBeenCalledWith(expect.objectContaining({ chain: customChain }));
  });

  it('builds the EIP-712 domain from the on-chain token name and the given chainId', async () => {
    const walletClient = { signTypedData: jest.fn().mockResolvedValue(VALID_SIG) };
    await generatePermitSignature(baseArgs({ walletClient, chainId: 5042 }));
    expect(walletClient.signTypedData).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: expect.objectContaining({ name: 'USDC', version: '2', chainId: 5042, verifyingContract: TOKEN_ADDRESS }),
      })
    );
  });

  it('retries once when the first signature fails to parse, and succeeds on the retry', async () => {
    const signTypedData = jest.fn()
      .mockResolvedValueOnce(UNPARSEABLE_SIG)
      .mockResolvedValueOnce(VALID_SIG);
    const result = await generatePermitSignature(baseArgs({ walletClient: { signTypedData } }));
    expect(result).toMatchObject({ v: 27 });
    expect(signTypedData).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalled();
  });

  it('returns an error when both the initial signature and the retry fail to parse', async () => {
    const signTypedData = jest.fn().mockResolvedValue(UNPARSEABLE_SIG);
    const result = await generatePermitSignature(baseArgs({ walletClient: { signTypedData } }));
    expect(result).toHaveProperty('error');
    expect(signTypedData).toHaveBeenCalledTimes(2);
  });

  it('returns an error when the signature has a zero s value', async () => {
    const walletClient = { signTypedData: jest.fn().mockResolvedValue(ZERO_S_SIG) };
    const result = await generatePermitSignature(baseArgs({ walletClient }));
    expect(result).toEqual({ error: 'Invalid signature: s value is zero' });
  });

  it('returns an error when the signature has a zero r value', async () => {
    (parseSignature as jest.Mock).mockReturnValueOnce({ v: 27, r: '0x' + '0'.repeat(64), s: '0x' + 'b'.repeat(64) });
    const result = await generatePermitSignature(baseArgs());
    expect(result).toEqual({ error: 'Invalid signature: r value is zero' });
  });

  it('returns a generic error message when a non-Error value is thrown', async () => {
    mockReadContract.mockReset().mockImplementation(() => { throw 'raw string failure'; });
    const result = await generatePermitSignature(baseArgs());
    expect(result).toEqual({ error: 'Unknown error during permit signature generation.' });
  });

  it('returns the Error message when reading the token name fails', async () => {
    mockReadContract.mockReset().mockImplementation(({ functionName }: { functionName: string }) => {
      if (functionName === 'name') return Promise.reject(new Error('RPC unreachable'));
      return Promise.resolve(0n);
    });
    const result = await generatePermitSignature(baseArgs());
    expect(result).toEqual({ error: 'RPC unreachable' });
  });
});
