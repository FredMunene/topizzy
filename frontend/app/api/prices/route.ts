import { NextResponse, NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const currency = searchParams.get('currency') || 'KES';

  try {
    let price = 0; // Fallback price: 0

    try {
      // Try to fetch from CoinGecko with shorter timeout
      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=${currency.toLowerCase()}`,
        {
          signal: AbortSignal.timeout(5000), // 5 seconds
          headers: {
            'Accept': 'application/json',
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data['usd-coin']?.[currency.toLowerCase()]) {
          price = data['usd-coin'][currency.toLowerCase()];
        }
      }
    } catch (fetchError) {
      console.warn('CoinGecko fetch failed, trying database fallback:', fetchError);

      // Try to get last price from database
      const { data: lastPrice } = await supabase
        .from('prices')
        .select('price')
        .eq('token', 'USDC')
        .eq('currency', currency)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (lastPrice?.price) {
        price = lastPrice.price;
        console.log('Using last price from database:', price);
      }
    }

    // Only insert if price changed from last entry
    try {
      const { data: lastPrice } = await supabase
        .from('prices')
        .select('price')
        .eq('token', 'USDC')
        .eq('currency', currency)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      // Insert only if price changed or no previous price exists
      if (!lastPrice || Math.abs(lastPrice.price - price) > 0.0001) {
        const { error } = await supabase
          .from('prices')
          .insert({
            token: 'USDC',
            currency: currency,
            price: price,
          });

        if (error) {
          console.warn('Failed to insert price into database:', error);
        }
      }
    } catch (insertError) {
      console.warn('Error checking/inserting price:', insertError);
    }

    return NextResponse.json({ success: true, price });
  } catch (error: unknown) {
    console.error('Error in prices API:', error);
    // Return 0 price if everything fails
    return NextResponse.json({ success: false, price: 0 });
  }
}