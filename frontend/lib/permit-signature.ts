import { createPublicClient, http, hexToSignature } from 'viem';
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
    const signature = await walletClient.signTypedData({
      account: owner,
      domain,
      types,
      primaryType: 'Permit',
      message
    });

    const { v, r, s } = hexToSignature(signature as `0x${string}`);

    // For Base App, we need to ensure v is in the correct range (27-28)
    // If v is 0 or 1, convert to 27 or 28
    let vValue = Number(v);
    if (vValue < 27) {
      vValue = vValue === 0 ? 27 : vValue === 1 ? 28 : vValue;
    }


    return { v: vValue, r, s, nonce, deadline };

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error during permit signature generation.';
    console.error('generatePermitSignature error:', error);
    return {
      error: errorMessage
    };
  }
}