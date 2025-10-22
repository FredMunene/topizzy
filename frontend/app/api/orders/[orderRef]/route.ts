import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Use service key to bypass RLS for server-side operations
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderRef: string }> }
) {
  try {
    const { orderRef } = await params
    console.log('Looking for order with orderRef:', orderRef)

    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('order_ref', orderRef)
      .single()

    console.log('Query result:', { order, error })

    if (error || !order) {
      console.log('Order not found, error:', error)
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    return NextResponse.json(order)
  } catch (error) {
    console.error('Error fetching order:', error)
    return NextResponse.json({ error: 'Failed to fetch order' }, { status: 500 })
  }
}