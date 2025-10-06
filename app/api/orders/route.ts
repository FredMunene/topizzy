import { NextRequest, NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const { phoneNumber, amountKes } = await request.json()

    if (!phoneNumber || !amountKes) {
      return NextResponse.json(
        { error: 'Missing phoneNumber or amountKes' },
        { status: 400 }
      )
    }

    // Get latest price
    const { data: priceData, error: priceError } = await supabase
      .from('prices')
      .select('price')
      .eq('token', 'USDC')
      .eq('currency', 'KES')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (priceError || !priceData) {
      return NextResponse.json(
        { error: 'Failed to get latest price' },
        { status: 500 }
      )
    }

    const price = priceData.price
    const amountUsdc = amountKes / price

    // Generate order_ref
    const orderRef = nanoid(8)

    // Insert order
    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .insert({
        order_ref: orderRef,
        phone_number: phoneNumber,
        product_type: 'airtime',
        amount_kes: amountKes,
        amount_usdc: amountUsdc,
        status: 'pending'
      })
      .select()
      .single()

    if (orderError) {
      throw orderError
    }

    return NextResponse.json({
      orderRef,
      amountKes,
      amountUsdc,
      price,
      orderId: orderData.id
    })
  } catch (error) {
    console.error('Error creating order:', error)
    return NextResponse.json(
      { error: 'Failed to create order' },
      { status: 500 }
    )
  }
}