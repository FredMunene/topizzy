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

export async function POST(request: NextRequest) {
  console.log('=== AIRTIME STATUS API START ===')
  try {
    // AfricasTalking sends form-encoded data, not JSON
    const formData = await request.formData()
    
    // Extract form fields
    const requestId = formData.get('requestId') as string
    const status = formData.get('status') as string
    const phoneNumber = formData.get('phoneNumber') as string
    const value = formData.get('value') as string
    const description = formData.get('description') as string
    
    console.log('Form data received:', {
      requestId,
      status,
      phoneNumber,
      value,
      description
    })

    // Debug: Check all transactions first
    const { data: allTransactions } = await supabase
      .from('airtime_transactions')
      .select('provider_request_id')
      .limit(10)
    
    console.log('All requestIds in database:', allTransactions?.map(t => t.provider_request_id))
    console.log('Looking for requestId:', JSON.stringify(requestId))
    console.log('RequestId length:', requestId.length)
    
    // Find airtime transaction
    const { data: transaction, error: txError } = await supabase
      .from('airtime_transactions')
      .select('*, orders(*)')
      .eq('provider_request_id', requestId)
      .single()

    if (txError || !transaction) {
      console.error('Transaction not found for requestId:', requestId, txError)
      
      // Try case-insensitive search
      const { data: caseInsensitive } = await supabase
        .from('airtime_transactions')
        .select('provider_request_id')
        .ilike('provider_request_id', requestId)
      
      console.log('Case-insensitive search results:', caseInsensitive)
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    console.log('Found transaction:', transaction)


    // Update transaction status
    console.log('Updating transaction status from', transaction.provider_status, 'to', status)
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
      console.log('Delivery successful - updating order to fulfilled')
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
      console.log('Delivery failed - initiating refund')
      
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
          chain: base,
          transport: http()
        })

        const publicClient = createPublicClient({
          chain: base,
          transport: http()
        })

        const order = transaction.orders
        const amountWei = parseUnits(order.amount_usdc.toString(), 6)

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

        await supabase
          .from('orders')
          .update({ 
            status: 'refunded',
            refund_tx_hash: refundTxHash,
            updated_at: new Date().toISOString()
          })
          .eq('id', transaction.order_id)

        console.log('Refund executed successfully:', refundTxHash)
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
    console.error('=== AIRTIME STATUS API ERROR ===')
    console.error('Error handling airtime status:', error)
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace')
    return NextResponse.json({ 
      error: 'Failed to handle status',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  } finally {
    console.log('=== AIRTIME STATUS API END ===')
  }
}