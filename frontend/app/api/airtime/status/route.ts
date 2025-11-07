import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createPublicClient, createWalletClient, http, parseUnits } from 'viem'
import { baseSepolia } from 'viem/chains'
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

export async function POST(request: NextRequest) {
  try {
    // AfricasTalking sends form-encoded data, not JSON
    const formData = await request.formData()
    
    // Extract form fields
    const requestId = formData.get('requestId') as string
    const status = formData.get('status') as string
    const _phoneNumber = formData.get('phoneNumber') as string
    const _value = formData.get('value') as string
    const _description = formData.get('description') as string
    

    
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
    const { error: updateError } = await supabase
      .from('airtime_transactions')
      .update({
        provider_status: status,
        updated_at: new Date().toISOString()
      })
      .eq('id', transaction.id)

    if (updateError) {
      console.error('Failed to update transaction:', updateError)
    }

    // Update order status based on final delivery status
    if (status === 'Success') {
      const { error: orderUpdateError } = await supabase
        .from('orders')
        .update({
          status: 'fulfilled',
          updated_at: new Date().toISOString()
        })
        .eq('id', transaction.order_id)

      if (orderUpdateError) {
        console.error('Failed to update order to fulfilled:', orderUpdateError)
      }
    } else if (status === 'Failed') {
      
      try {
        if (!TREASURY_PRIVATE_KEY) {
          console.error('Treasury private key not configured')
          await supabase
            .from('orders')
            .update({ status: 'refunded' })
            .eq('id', transaction.order_id)
          return NextResponse.json({ error: 'Manual refund required' }, { status: 500 })
        }

        // Ensure private key has 0x prefix
        const privateKey = TREASURY_PRIVATE_KEY.startsWith('0x') ? TREASURY_PRIVATE_KEY : `0x${TREASURY_PRIVATE_KEY}`
        const account = privateKeyToAccount(privateKey as `0x${string}`)
        const walletClient = createWalletClient({
          account,
          chain: baseSepolia,
          transport: http()
        })

        const publicClient = createPublicClient({
          chain: baseSepolia ,
          transport: http()
        })

        const order = transaction.orders
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

        // Wait for refund transaction
        await publicClient.waitForTransactionReceipt({
          hash: refundTxHash,
          confirmations: 1
        })

        // Update order with refund status and refund tx hash
        const { error: updateError } = await supabase
          .from('orders')
          .update({ 
            status: 'refunded',
            refund_tx_hash: refundTxHash,
            updated_at: new Date().toISOString()
          })
          .eq('id', transaction.order_id)
        
        if (updateError) {
          console.error('Failed to update order with refund tx hash:', updateError)
        }
      } catch (refundError) {
        console.error('Refund execution failed:', refundError)
        await supabase
          .from('orders')
          .update({ status: 'refunded' })
          .eq('id', transaction.order_id)
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
