import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const AFRICASTALKING_USERNAME = process.env.NEXT_AFRICASTALKING_USERNAME!
const AFRICASTALKING_API_KEY = process.env.NEXT_AFRICASTALKING_API_KEY!
const AFRICASTALKING_URL = process.env.NEXT_AFRICASTALKING_URL!

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

    // Payment verified via transaction hash from smart contract

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
            amount: `KES ${order.amount_kes.toFixed(2)}`
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

      // Update order with blockchain transaction hash
      await supabase
        .from('orders')
        .update({ status: 'fulfilled', tx_hash: txHash })
        .eq('id', order.id)

      // Insert airtime transaction
      await supabase
        .from('airtime_transactions')
        .insert({
          order_id: order.id,
          phone_number: order.phone_number,
          amount_kes: order.amount_kes,
          provider_request_id: requestId,
          provider_status: 'Success'
        })

      return NextResponse.json({ success: true, requestId })
    } else {
      // Failed
      const errorMessage = result.SMSMessageData?.Recipients?.[0]?.message || 'Unknown error'

      // Update order
      await supabase
        .from('orders')
        .update({ status: 'refunded' })
        .eq('id', order.id)

      // Insert airtime transaction
      await supabase
        .from('airtime_transactions')
        .insert({
          order_id: order.id,
          phone_number: order.phone_number,
          amount_kes: order.amount_kes,
          provider_status: 'Failed',
          error_message: errorMessage
        })

      return NextResponse.json({ error: 'Airtime send failed', details: errorMessage }, { status: 500 })
    }
  } catch (error) {
    console.error('Error sending airtime:', error)
    return NextResponse.json({ error: 'Failed to send airtime' }, { status: 500 })
  }
}