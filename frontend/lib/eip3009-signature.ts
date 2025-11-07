import { WalletClient } from 'viem'
import { randomBytes } from 'crypto'

interface EIP3009SignatureParams {
  tokenAddress: `0x${string}`
  from: `0x${string}`
  to: `0x${string}`
  value: bigint
  validAfter: bigint
  validBefore: bigint
  nonce: `0x${string}`
  walletClient: WalletClient
  chainId: number
}

export async function generateEIP3009Signature({
  tokenAddress,
  from,
  to,
  value,
  validAfter,
  validBefore,
  nonce,
  walletClient,
  chainId
}: EIP3009SignatureParams) {
  try {
    const domain = {
      name: 'USD Coin',
      version: '2',
      chainId,
      verifyingContract: tokenAddress
    }

    const types = {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' }
      ]
    }

    const message = {
      from,
      to,
      value,
      validAfter,
      validBefore,
      nonce
    }

    const signature = await walletClient.signTypedData({
      account: walletClient.account!,
      domain,
      types,
      primaryType: 'TransferWithAuthorization',
      message
    })

    // Parse signature into v, r, s
    const r = signature.slice(0, 66) as `0x${string}`
    const s = `0x${signature.slice(66, 130)}` as `0x${string}`
    const v = parseInt(signature.slice(130, 132), 16)

    return { v, r, s, error: null }
  } catch (error) {
    console.error('EIP-3009 signature error:', error)
    return { v: null, r: null, s: null, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

export function generateRandomNonce(): `0x${string}` {
  return `0x${randomBytes(32).toString('hex')}` as `0x${string}`
}
