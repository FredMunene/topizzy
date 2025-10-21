import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

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