import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createPublicClient, createWalletClient, http, parseUnits } from 'viem'
import { base } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { AIRTIME_ABI } from '@/lib/airtime-abi'

const supabaseUrl = process.env.NEXT_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const AIRTIME_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_AIRTIME_CONTRACT_ADDRESS! as `0x${string}`
const TREASURY_PRIVATE_KEY = process.env.TREASURY_PRIVATE_KEY as `0x${string}`

// Use service key to bypass RLS for server-side operations
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

// Helper functions to reduce cognitive complexity
async function processSuccessfulTransaction(orderId: string) {
  const { error: orderUpdateError } = await supabase
    .from('orders')
    .update({
      status: 'fulfilled',
      updated_at: new Date().toISOString()
    })
    .eq('id', orderId)

  if (orderUpdateError) {
    console.error('Failed to update order to fulfilled:', orderUpdateError)
  }
}

async function executeRefund(order: any): Promise<string | undefined> {
  if (!TREASURY_PRIVATE_KEY) {
    console.error('Treasury private key not configured')
    await markOrderAsRefunded(order.id)
    throw new Error('Manual refund required')
  }

  const privateKey = TREASURY_PRIVATE_KEY.startsWith('0x') ? TREASURY_PRIVATE_KEY : `0x${TREASURY_PRIVATE_KEY}`
  const account = privateKeyToAccount(privateKey as `0x${string}`)
  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http()
  })

  const publicClient = createPublicClient({
    chain: base,
    transport: http()
  })

  // Refund only airtime cost, keep service fee
  const refundAmount = order.amount_usdc - (order.service_fee_usdc || 0)
  const amountWei = parseUnits(refundAmount.toString(), 6)
  const refundTxHash = await walletClient.writeContract({
    address: AIRTIME_CONTRACT_ADDRESS,
    abi: AIRTIME_ABI,
    functionName: 'refund',
    args: [
      order.order_ref,
      order.wallet_address as `0x${string}`,
      amountWei
    ]
  })

  await publicClient.waitForTransactionReceipt({
    hash: refundTxHash,
    confirmations: 1
  })

  return refundTxHash || undefined
}

async function markOrderAsRefunded(orderId: string, txHash?: string) {
  const updateData = {
    status: 'refunded',
    updated_at: new Date().toISOString(),
    ...(txHash && { refund_tx_hash: txHash })
  }

  const { error: updateError } = await supabase
    .from('orders')
    .update(updateData)
    .eq('id', orderId)

  if (updateError) {
    console.error('Failed to update order refund status:', updateError)
  }
}

async function updateTransactionStatus(transactionId: string, status: string) {
  const { error: updateError } = await supabase
    .from('airtime_transactions')
    .update({
      provider_status: status,
      updated_at: new Date().toISOString()
    })
    .eq('id', transactionId)

  if (updateError) {
    console.error('Failed to update transaction:', updateError)
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const requestId = formData.get('requestId') as string
    const status = formData.get('status') as string

    // Find airtime transaction
    const { data: transaction, error: txError } = await supabase
      .from('airtime_transactions')
      .select('*, orders(*)')
      .eq('provider_request_id', requestId)
      .single()

    if (txError || !transaction) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    // Update transaction status
    await updateTransactionStatus(transaction.id, status)

    // Process based on status
    if (status === 'Success') {
      await processSuccessfulTransaction(transaction.order_id)
    } else if (status === 'Failed') {
      try {
        const refundTxHash = await executeRefund(transaction.orders)
        // refundTxHash will be undefined if the refund wasn't executed
        await markOrderAsRefunded(transaction.order_id, refundTxHash)
      } catch (refundError) {
        console.error('Refund execution failed:', refundError)
        await markOrderAsRefunded(transaction.order_id)
        if (refundError instanceof Error && refundError.message === 'Manual refund required') {
          return NextResponse.json({ error: 'Manual refund required' }, { status: 500 })
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error handling airtime status:', error)
    return NextResponse.json({ 
      error: 'Failed to handle status',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
