import { NextResponse, NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';

// In-memory cache to prevent concurrent API calls
const pendingRequests = new Map<string, Promise<number>>();

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const currency = searchParams.get('currency') || 'KES';

  try {
    // First check database for existing price
    const { data: lastPrice } = await supabase
      .from('prices')
      .select('price, updated_at')
      .eq('token', 'USDC')
      .eq('currency', currency)
      .single();

    const now = new Date();
    const fifteenSecondsAgo = new Date(now.getTime() - 15000);
    
    // If price exists and is less than 15 seconds old, return it
    if (lastPrice && new Date(lastPrice.updated_at) > fifteenSecondsAgo) {
      return NextResponse.json({ success: true, price: lastPrice.price });
    }

    // Check if there's already a pending request for this currency
    const cacheKey = `USDC-${currency}`;
    if (pendingRequests.has(cacheKey)) {
      const price = await pendingRequests.get(cacheKey)!;
      return NextResponse.json({ success: true, price });
    }

    // Create a new request promise
    const fetchPromise = (async (): Promise<number> => {
      let price = lastPrice?.price || 0;
      
      try {
        const response = await fetch(
          'https://api.coinbase.com/v2/exchange-rates?currency=USDC',
          {
            signal: AbortSignal.timeout(5000),
            headers: { 'Accept': 'application/json' }
          }
        );

        if (response.ok) {
          const data = await response.json();
          if (data.data?.rates?.[currency]) {
            price = parseFloat(parseFloat(data.data.rates[currency]).toFixed(2));
            
            // Update database with new price
            await supabase
              .from('prices')
              .upsert({
                token: 'USDC',
                currency: currency,
                price: price,
                updated_at: now.toISOString()
              }, {
                onConflict: 'token,currency'
              });
          }
        }
      } catch (fetchError) {
        console.warn('Coinbase fetch failed, using existing price:', fetchError);
      }
      
      return price;
    })();

    // Store the promise and clean up after completion
    pendingRequests.set(cacheKey, fetchPromise);
    
    try {
      const price = await fetchPromise;
      return NextResponse.json({ success: true, price });
    } finally {
      pendingRequests.delete(cacheKey);
    }
  } catch (error: unknown) {
    console.error('Error in prices API:', error);
    // Return 0 price if everything fails
    return NextResponse.json({ success: false, price: 0 });
  }
}