import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { createPublicClient, http, parseUnits, createWalletClient } from 'viem'
import { baseSepolia } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { AIRTIME_ABI } from '@/lib/airtime-abi'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const AFRICASTALKING_USERNAME = process.env.NEXT_AFRICASTALKING_USERNAME!
const AFRICASTALKING_API_KEY = process.env.NEXT_AFRICASTALKING_API_KEY!
const AFRICASTALKING_URL = process.env.NEXT_AFRICASTALKING_URL!
const AIRTIME_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_AIRTIME_CONTRACT_ADDRESS! as `0x${string}`
const TREASURY_PRIVATE_KEY = process.env.TREASURY_PRIVATE_KEY as `0x${string}`

export async function POST(request: NextRequest) {
  try {
    const { orderRef, txHash } = await request.json()

    if (!orderRef) {
      return NextResponse.json({ error: 'Missing orderRef' }, { status: 400 })
    }

    if (!txHash) {
      return NextResponse.json({ error: 'Missing transaction hash' }, { status: 400 })
    }

    // Get order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('order_ref', orderRef)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (order.status !== 'pending') {
      return NextResponse.json({ error: 'Order not pending' }, { status: 400 })
    }

    // Verify blockchain transaction
    const publicClient = createPublicClient({
      chain: baseSepolia,
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

    // Use order currency for airtime request
    const currency = order.currency || 'KES'

    // Send airtime
    const response = await fetch(AFRICASTALKING_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apiKey': AFRICASTALKING_API_KEY,
        'Accept': 'application/json'
      },
      body: JSON.stringify({
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
      })
    })

    const result = await response.json()

    if (response.ok && result.SMSMessageData?.Recipients?.[0]?.status === 'Success') {
      // Success
      const requestId = result.SMSMessageData.Recipients[0].requestId

      // Update order status
      await supabase
        .from('orders')
        .update({ status: 'fulfilled' })
        .eq('id', order.id)

      // Insert airtime transaction
      await supabase
        .from('airtime_transactions')
        .insert({
          order_id: order.id,
          phone_number: order.phone_number,
          amount: order.amount,
          currency: currency,
          provider_request_id: requestId,
          provider_status: 'Success'
        })

      return NextResponse.json({ success: true, requestId })
    } else {
      // Failed - execute actual refund via smart contract
      const errorMessage = result.SMSMessageData?.Recipients?.[0]?.message || 'Unknown error'

      // Insert airtime transaction record
      await supabase
        .from('airtime_transactions')
        .insert({
          order_id: order.id,
          phone_number: order.phone_number,
          amount: order.amount,
          currency: currency,
          provider_status: 'Failed',
          error_message: errorMessage
        })

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
          chain: baseSepolia,
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
    console.error('Error sending airtime:', error)
    return NextResponse.json({ error: 'Failed to send airtime' }, { status: 500 })
  }
}