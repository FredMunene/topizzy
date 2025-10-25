import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

/**
 * Generates an EIP-2612 permit signature for USDC
 */
export async function generatePermitSignature({
  tokenAddress,
  owner,
  spender,
  value,
  deadline,
  walletClient,
  chainId
}: {
  tokenAddress: `0x${string}`;
  owner: `0x${string}`;
  spender: `0x${string}`;
  value: string | number | bigint;
  deadline: number;
  walletClient: { signTypedData: (params: { account: `0x${string}`; domain: Record<string, unknown>; types: Record<string, unknown>; primaryType: string; message: Record<string, unknown> }) => Promise<string>; };
  chainId: number;
}) {
  try {
    const publicClient = createPublicClient({
      chain: base,
      transport: http()
    });

    // Read token name for accurate EIP-712 domain binding
    const tokenName = await publicClient.readContract({
      address: tokenAddress,
      abi: [{
        name: 'name',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'string' }]
      }],
      functionName: 'name'
    }) as string;

    // Get nonce
    const nonce = await publicClient.readContract({
      address: tokenAddress,
      abi: [{
        name: 'nonces',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'owner', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }]
      }],
      functionName: 'nonces',
      args: [owner]
    });

    // Domain: use on-chain token name; USDC typically uses version "2"
    const domain = {
      name: tokenName,
      version: '2',
      chainId,
      verifyingContract: tokenAddress
    } as const;

    // Types
    const types = {
      Permit: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' }
      ]
    };

    const message = {
      owner,
      spender,
      value: BigInt(value),
      nonce,
      deadline: BigInt(deadline)
    };

    // Sign the message
    console.log('[permit] signing typed data', { domain, types, message });
    const signature = await walletClient.signTypedData({
      account: owner,
      domain,
      types,
      primaryType: 'Permit',
      message
    });
    console.log('[permit] raw signature returned by wallet:', signature);

    // Robust signature parsing to support wallets that return v as 0/1 or 27/28
    function parseSignature(sig: string) {
      if (!sig) throw new Error('Empty signature');
      const s = sig.startsWith('0x') ? sig.slice(2) : sig;
      // Expect 65 bytes (130 hex chars) signature (r(32) + s(32) + v(1))
      if (s.length < 130) {
        throw new Error(`Unexpected signature length: ${s.length}`);
      }

      const r = '0x' + s.slice(0, 64);
      const sValue = '0x' + s.slice(64, 128);
      let vHex = s.slice(128, 130);
      // Some wallets return a 1-byte v as 00/01, others 1b/1c (27/28), some append 00/01 as 2 hex digits
      if (!vHex) {
        // fallback: take last byte
        vHex = s.slice(-2);
      }
      let v = Number.parseInt(vHex, 16);

      // Normalise v to 27 or 28
      if (v === 0) v = 27;
      else if (v === 1) v = 28;
      else if (v >= 27 && v <= 28) {
        // v already 27 or 28, keep as-is
      }
      else if (v > 28) {
        // handle chain id embedding or other variants: reduce to lowest byte
        v = v & 0xff;
        if (v === 0) v = 27;
        else if (v === 1) v = 28;
      }

      return { v, r, s: sValue } as { v: number; r: `0x${string}`; s: `0x${string}` };
    }

    let parsed;
    try {
      parsed = parseSignature(signature);
    } catch (err) {
      console.warn('[permit] initial parse failed, attempting retry once', err);
      // retry once after a short delay - some wallets may need a moment
      await new Promise((res) => setTimeout(res, 100));
      const retrySig = await walletClient.signTypedData({
        account: owner,
        domain,
        types,
        primaryType: 'Permit',
        message
      });
      console.log('[permit] retry raw signature:', retrySig);
      parsed = parseSignature(retrySig);
    }

    console.log('[permit] parsed signature components:', parsed);

    // Validate signature components
    if (!parsed.s || parsed.s === '0x' + '0'.repeat(64)) {
      throw new Error('Invalid signature: s value is zero');
    }
    if (!parsed.r || parsed.r === '0x' + '0'.repeat(64)) {
      throw new Error('Invalid signature: r value is zero');
    }

    return { v: parsed.v, r: parsed.r, s: parsed.s, nonce, deadline };

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error during permit signature generation.';
    console.error('generatePermitSignature error:', error);
    return {
      error: errorMessage
    };
  }
}