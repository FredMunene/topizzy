import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    // Example data: { phoneNumber, description, status, requestId, discount, value }

    const { requestId, status } = data

    // Find airtime transaction
    const { data: transaction, error: txError } = await supabase
      .from('airtime_transactions')
      .select('*, orders(*)')
      .eq('provider_request_id', requestId)
      .single()

    if (txError || !transaction) {
      console.error('Transaction not found for requestId:', requestId)
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    // Update transaction
    await supabase
      .from('airtime_transactions')
      .update({
        provider_status: status,
        updated_at: new Date().toISOString()
      })
      .eq('id', transaction.id)

    // Update order status
    let orderStatus = 'pending'
    if (status === 'Success') {
      orderStatus = 'fulfilled'
    } else if (status === 'Failed') {
      orderStatus = 'refunded'
    }

    await supabase
      .from('orders')
      .update({
        status: orderStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', transaction.order_id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error handling airtime status:', error)
    return NextResponse.json({ error: 'Failed to handle status' }, { status: 500 })
  }
}