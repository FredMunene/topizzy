import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  try {
    // Fetch USDC price in KES from Coingecko
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=kes'
    )

    if (!response.ok) {
      throw new Error('Failed to fetch price from Coingecko')
    }

    const data = await response.json()
    const price = data['usd-coin']?.kes

    if (!price) {
      throw new Error('Price not found in response')
    }

    // Insert into prices table
    const { error } = await supabase
      .from('prices')
      .insert({
        token: 'USDC',
        currency: 'KES',
        price: price
      })

    if (error) {
      throw error
    }

    return NextResponse.json({ success: true, price })
  } catch (error) {
    console.error('Error fetching price:', error)
    return NextResponse.json(
      { error: 'Failed to fetch and store price' },
      { status: 500 }
    )
  }
}