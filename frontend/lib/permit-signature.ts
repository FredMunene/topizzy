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
    const tokenName: string = await publicClient.readContract({
      address: tokenAddress,
      abi: [{
        name: 'name',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'string' }]
      }],
      functionName: 'name'
    });

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
    // Helper functions to reduce complexity
    function normalizeSignature(sig: string): string {
      if (!sig) throw new Error('Empty signature');
      let s = sig.startsWith('0x') ? sig.slice(2) : sig;
      
      console.log('[permit] processing signature with length:', s.length);
      s = s.replace(/^0+/, '').replace(/0+$/, '');
      console.log('[permit] trimmed signature length:', s.length);
      
      if (!s || s.length === 0) {
        const orig = sig.startsWith('0x') ? sig.slice(2) : sig;
        const start = Math.floor((orig.length - 130) / 2);
        s = orig.slice(start, start + 130).replace(/^0+/, '');
        console.log('[permit] extracted middle signature length:', s.length);
      }
      
      return s;
    }

    function normalizeV(v: number): number {
      if (v === 0) return 27;
      if (v === 1) return 28;
      if (v >= 27 && v <= 28) return v;
      
      // Handle chain ID embedding or other variants
      if (v > 28) {
        const normalized = v & 0xff;
        return normalizeV(normalized);
      }
      
      return v;
    }

    function parseStandard65Byte(s: string, r: `0x${string}`): { v: number; r: `0x${string}`; s: `0x${string}` } {
      const sValue = ('0x' + s.slice(64, 128)) as `0x${string}`;
      const vHex = s.slice(128, 130) || s.slice(-2);
      const v = normalizeV(Number.parseInt(vHex, 16));
      return { v, r, s: sValue };
    }

    function parseCompact64Byte(s: string, r: `0x${string}`): { v: number; r: `0x${string}`; s: `0x${string}` } {
      const vsHex = s.slice(64, 128);
      const vsBig = BigInt('0x' + vsHex);
      const v = ((vsBig >> 255n) & 1n) === 0n ? 27 : 28;
      
      const sBig = vsBig & ((1n << 255n) - 1n);
      const sHex = sBig.toString(16).padStart(64, '0');
      const sValue = ('0x' + sHex) as `0x${string}`;
      return { v, r, s: sValue };
    }

    function parseSignature(sig: string) {
      const s = normalizeSignature(sig);
      
      if (!s || s.length === 0) {
        throw new Error(`Invalid signature format. Raw: ${sig}`);
      }
      
      if (s.length !== 130 && s.length !== 128) {
        throw new Error(`Unexpected signature length after processing: ${s.length} (raw: ${sig})`);
      }

      const r = ('0x' + s.slice(0, 64)) as `0x${string}`;
      return s.length === 130 
        ? parseStandard65Byte(s, r)
        : parseCompact64Byte(s, r);
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