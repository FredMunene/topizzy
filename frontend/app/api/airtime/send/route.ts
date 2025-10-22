import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createPublicClient, http, parseUnits, createWalletClient } from 'viem'
import { base } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { AIRTIME_ABI } from '@/lib/airtime-abi'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabaseUrl = process.env.NEXT_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// Use service key if available to bypass RLS for server-side workflow
const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

const AFRICASTALKING_USERNAME = process.env.NEXT_AFRICASTALKING_USERNAME!
const AFRICASTALKING_API_KEY = process.env.NEXT_AFRICASTALKING_API_KEY!
const AFRICASTALKING_URL = process.env.NEXT_AFRICASTALKING_URL!
const AIRTIME_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_AIRTIME_CONTRACT_ADDRESS! as `0x${string}`
const TREASURY_PRIVATE_KEY = process.env.TREASURY_PRIVATE_KEY as `0x${string}`

export async function POST(request: NextRequest) {
  console.log('=== AIRTIME SEND API START ===')
  try {
    const body = await request.json()
    console.log('Request body:', body)
    
    const { orderRef, txHash } = body

    if (!orderRef) {
      console.log('ERROR: Missing orderRef')
      return NextResponse.json({ error: 'Missing orderRef' }, { status: 400 })
    }

    if (!txHash) {
      console.log('ERROR: Missing transaction hash')
      return NextResponse.json({ error: 'Missing transaction hash' }, { status: 400 })
    }
    
    console.log('Processing order:', orderRef, 'with txHash:', txHash)

    // Get order
    console.log('Fetching order from database...')
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('order_ref', orderRef)
      .single()

    if (orderError) {
      console.log('Database error fetching order:', orderError)
      return NextResponse.json({ error: 'Order not found', details: orderError.message }, { status: 404 })
    }
    
    if (!order) {
      console.log('Order not found in database')
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }
    
    console.log('Order found:', order)

    if (order.status !== 'pending') {
      console.log('Order status is not pending:', order.status)
      
      if (order.status === 'refunded') {
        return NextResponse.json({ 
          error: 'Order already refunded', 
          status: 'refunded',
          message: 'This order was previously refunded. Please create a new order to try again.',
          refundTxHash: order.refund_tx_hash
        }, { status: 400 })
      }
      
      if (order.status === 'fulfilled') {
        return NextResponse.json({ 
          error: 'Order already fulfilled', 
          status: 'fulfilled',
          message: 'Airtime has already been sent for this order.',
          txHash: order.tx_hash
        }, { status: 400 })
      }
      
      return NextResponse.json({ 
        error: 'Order not pending', 
        status: order.status,
        message: `Order status is ${order.status}. Only pending orders can be processed.`
      }, { status: 400 })
    }

    // Verify blockchain transaction
    const publicClient = createPublicClient({
      chain: base,
      transport: http()
    })

    try {
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash as `0x${string}`,
        confirmations: 1
      })

      if (receipt.status !== 'success') {
        return NextResponse.json({ error: 'Transaction failed on blockchain' }, { status: 400 })
      }

      // Verify the transaction was to our contract
      if (receipt.to?.toLowerCase() !== AIRTIME_CONTRACT_ADDRESS.toLowerCase()) {
        return NextResponse.json({ error: 'Transaction not to Airtime contract' }, { status: 400 })
      }

      // Parse logs to verify OrderPaid event and amount
      const orderPaidEvent = receipt.logs.find(log => {
        try {
          // Check if log is from our contract
          return log.address.toLowerCase() === AIRTIME_CONTRACT_ADDRESS.toLowerCase()
        } catch {
          return false
        }
      })

      if (!orderPaidEvent) {
        return NextResponse.json({ error: 'OrderPaid event not found in transaction' }, { status: 400 })
      }
    } catch (verifyError) {
      console.error('Transaction verification failed:', verifyError)
      return NextResponse.json({ error: 'Could not verify transaction' }, { status: 400 })
    }

    // Save tx_hash BEFORE attempting airtime send (maintains audit trail)
    await supabase
      .from('orders')
      .update({ tx_hash: txHash })
      .eq('id', order.id)


    // Use order currency or default to KES
    const currency = order.currency || 'KES'
    
    console.log('Preparing airtime request...')
    const airtimePayload = {
      username: AFRICASTALKING_USERNAME,
      recipients: [
        {
          phoneNumber: order.phone_number,
          amount: `${currency} ${order.amount.toFixed(2)}`
        }
      ],
      maxNumRetry: 3,
      requestMetadata: {
        orderRef: orderRef
      }
    }
    
    console.log('Sending airtime request:', airtimePayload)

    // Send airtime
    const response = await fetch(AFRICASTALKING_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apiKey': AFRICASTALKING_API_KEY,
        'Accept': 'application/json'
      },
      body: JSON.stringify(airtimePayload)
    })
    
    console.log('AfricasTalking response status:', response.status)

    const result = await response.json()
    console.log('AfricasTalking response:', result)

    if (response.ok && result.responses?.[0]?.status === 'Sent') {
      // Airtime request accepted - keep order as pending until callback confirms delivery
      const requestId = result.responses[0].requestId
      console.log('Airtime request accepted, requestId:', requestId)

      // Insert airtime transaction (order stays pending)
      console.log('Inserting airtime transaction with requestId:', requestId)
      const { error: insertError } = await supabase
        .from('airtime_transactions')
        .insert({
          order_id: order.id,
          phone_number: order.phone_number,
          amount: order.amount,
          currency: currency,
          provider_request_id: requestId,
          provider_status: 'Sent'
        })
        
      if (insertError) {
        console.error('Failed to insert airtime transaction:', insertError)
      } else {
        console.log('Airtime transaction inserted successfully')
      }

      return NextResponse.json({ success: true, requestId })
    } else {
      // Failed - execute actual refund via smart contract
      const errorMessage = result.responses?.[0]?.errorMessage || result.errorMessage || 'Unknown error'
      const requestId = result.responses?.[0]?.requestId
      console.log('Airtime request failed:', errorMessage, 'requestId:', requestId)

      // Insert airtime transaction record
      console.log('Inserting failed airtime transaction with requestId:', requestId)
      const { error: insertError } = await supabase
        .from('airtime_transactions')
        .insert({
          order_id: order.id,
          phone_number: order.phone_number,
          amount: order.amount,
          currency: currency,
          provider_request_id: requestId,
          provider_status: 'Failed',
          error_message: errorMessage
        })
        
      if (insertError) {
        console.error('Failed to insert failed airtime transaction:', insertError)
      } else {
        console.log('Failed airtime transaction inserted successfully')
      }

      // Execute refund on blockchain
      try {
        if (!TREASURY_PRIVATE_KEY) {
          console.error('Treasury private key not configured')
          // Update order to refunded status (manual refund required)
          await supabase
            .from('orders')
            .update({ status: 'refunded' })
            .eq('id', order.id)
          return NextResponse.json({ error: 'Airtime send failed, manual refund required', details: errorMessage }, { status: 500 })
        }

        const account = privateKeyToAccount(TREASURY_PRIVATE_KEY)
        const walletClient = createWalletClient({
          account,
          chain: base,
          transport: http()
        })

        const amountWei = parseUnits(order.amount_usdc.toString(), 6) // USDC has 6 decimals

        const refundTxHash = await walletClient.writeContract({
          address: AIRTIME_CONTRACT_ADDRESS,
          abi: AIRTIME_ABI,
          functionName: 'refund',
          args: [
            orderRef,
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
        await supabase
          .from('orders')
          .update({ 
            status: 'refunded',
            refund_tx_hash: refundTxHash
          })
          .eq('id', order.id)

        return NextResponse.json({ 
          error: 'Airtime send failed, refund executed', 
          details: errorMessage,
          refundTxHash 
        }, { status: 500 })
      } catch (refundError) {
        console.error('Refund execution failed:', refundError)
        // Update order to refunded status (but refund failed)
        await supabase
          .from('orders')
          .update({ status: 'refunded' })
          .eq('id', order.id)
        
        return NextResponse.json({ 
          error: 'Airtime send failed and refund failed', 
          details: errorMessage,
          refundError: refundError instanceof Error ? refundError.message : 'Unknown refund error'
        }, { status: 500 })
      }
    }
  } catch (error) {
    console.error('=== AIRTIME SEND API ERROR ===')
    console.error('Error details:', error)
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace')
    return NextResponse.json({ 
      error: 'Failed to send airtime', 
      details: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  } finally {
    console.log('=== AIRTIME SEND API END ===')
  }
}