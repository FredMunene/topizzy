import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  try {
    let price = 129; // Fallback price: 1 USDC = 129 KES

    try {
      // Try to fetch from CoinGecko with shorter timeout
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=kes',
        {
          signal: AbortSignal.timeout(5000), // 5 seconds
          headers: {
            'Accept': 'application/json',
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data['usd-coin']?.kes) {
          price = data['usd-coin'].kes;
        }
      }
    } catch (fetchError) {
      console.warn('CoinGecko fetch failed, trying database fallback:', fetchError);
      
      // Try to get last price from database
      const { data: lastPrice } = await supabase
        .from('prices')
        .select('price')
        .eq('token', 'USDC')
        .eq('currency', 'KES')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (lastPrice?.price) {
        price = lastPrice.price;
        console.log('Using last price from database:', price);
      }
    }

    // Insert into prices table
    const { error } = await supabase
      .from('prices')
      .insert({
        token: 'USDC',
        currency: 'KES',
        price: price,
      });

    if (error) {
      console.warn('Failed to insert price into database:', error);
    }

    return NextResponse.json({ success: true, price });
  } catch (error: unknown) {
    console.error('Error in prices API:', error);
    // Return fallback price even if everything fails
    return NextResponse.json({ success: true, price: 150 });
  }
}