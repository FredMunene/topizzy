import { NextResponse, NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';

// In-memory cache to prevent concurrent API calls
const pendingRequests = new Map<string, Promise<number>>();

export async function GET(request: NextRequest) {
  // Track the last successful price for fallback
  let lastSuccessfulPrice: { price: number; updated_at: string } | null = null;

  try {
    // Validate required environment variables
    if (!process.env.NEXT_SUPABASE_URL || !process.env.NEXT_SUPABASE_ANON_KEY) {
      console.error('Missing required Supabase environment variables');
      return NextResponse.json(
        { error: 'Service configuration error' },
        { status: 500 }
      );
    }

    const { searchParams } = request.nextUrl
    const currency = searchParams.get('currency') || 'KES';

    // Add a small delay to prevent too frequent requests
    await new Promise(resolve => setTimeout(resolve, 500));
    // First check database for existing price
    const { data: priceFromDb } = await supabase
      .from('prices')
      .select('price, updated_at')
      .eq('token', 'USDC')
      .eq('currency', currency)
      .single();

    const now = new Date();
    const fifteenSecondsAgo = new Date(now.getTime() - 15000);
    
    // If price exists and is less than 15 seconds old, return it
    if (priceFromDb && new Date(priceFromDb.updated_at) > fifteenSecondsAgo) {
      lastSuccessfulPrice = priceFromDb;
      return NextResponse.json({ success: true, price: priceFromDb.price });
    }

    // Check if there's already a pending request for this currency
    const cacheKey = `USDC-${currency}`;
    if (pendingRequests.has(cacheKey)) {
      const cachedPrice = await pendingRequests.get(cacheKey)!;
      return NextResponse.json({ success: true, price: cachedPrice });
    }

    // Create a new request promise
    const fetchPromise = (async (): Promise<number> => {
      let currentPrice = priceFromDb?.price || 0;
      
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
            currentPrice = Number.parseFloat(Number.parseFloat(data.data.rates[currency]).toFixed(2));
            
            // Update database with new price
            await supabase
              .from('prices')
              .upsert({
                token: 'USDC',
                currency: currency,
                price: currentPrice,
                updated_at: now.toISOString()
              }, {
                onConflict: 'token,currency'
              });

            // Store as last successful price
            lastSuccessfulPrice = { price: currentPrice, updated_at: now.toISOString() };
          }
        }
      } catch (fetchError) {
        console.warn('Coinbase fetch failed, using existing price:', fetchError);
      }
      
      return currentPrice;
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
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error in prices API:', errorMessage);

    // Return fallback price and error info
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch price',
      details: errorMessage,
      price: lastSuccessfulPrice?.price || 0,
      using_fallback: true
    }, {
      status: 500
    });
  }
}