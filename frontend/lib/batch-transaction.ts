import { WalletClient, encodeFunctionData } from 'viem'
import { baseSepolia } from 'viem/chains'

interface BatchCall {
  to: `0x${string}`
  data: `0x${string}`
  value?: bigint
}

export async function executeBatchTransaction(
  walletClient: WalletClient,
  calls: BatchCall[]
): Promise<`0x${string}`> {
  // Check if wallet supports batch transactions (Safe, etc.)
  if ('sendBatchTransaction' in walletClient) {
    // @ts-ignore - Safe wallet specific method
    return await walletClient.sendBatchTransaction({
      account: walletClient.account!,
      calls: calls.map(call => ({
        to: call.to,
        data: call.data,
        value: call.value || 0n
      }))
    })
  }
  
  // Fallback: execute calls sequentially
  let lastTxHash: `0x${string}` = '0x'
  for (const call of calls) {
    lastTxHash = await walletClient.sendTransaction({
      account: walletClient.account!,
      chain: baseSepolia,
      to: call.to,
      data: call.data,
      value: call.value || 0n
    })
  }
  
  return lastTxHash
}

export function createApproveCallData(
  spender: `0x${string}`,
  amount: bigint
): `0x${string}` {
  return encodeFunctionData({
    abi: [{
      name: 'approve',
      type: 'function',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'spender', type: 'address' },
        { name: 'amount', type: 'uint256' }
      ],
      outputs: [{ name: '', type: 'bool' }]
    }],
    functionName: 'approve',
    args: [spender, amount]
  })
}

export function createDepositCallData(
  depositRef: string,
  amount: bigint
): `0x${string}` {
  return encodeFunctionData({
    abi: [{
      name: 'deposit',
      type: 'function',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'depositRef', type: 'string' },
        { name: 'amount', type: 'uint256' }
      ],
      outputs: [{ name: 'depositId', type: 'uint256' }]
    }],
    functionName: 'deposit',
    args: [depositRef, amount]
  })
}