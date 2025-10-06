import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Create a Supabase client with the service key
const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

export async function POST(request: NextRequest) {
  try {
    const { phoneNumber, amountKes, walletAddress } = await request.json();

    if (!phoneNumber || !amountKes || !walletAddress) {
      return NextResponse.json(
        { error: 'Missing phoneNumber, amountKes, or walletAddress' },
        { status: 400 }
      );
    }

    // Get latest price
    const { data: priceData, error: priceError } = await supabase
      .from('prices')
      .select('price')
      .eq('token', 'USDC')
      .eq('currency', 'KES')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (priceError || !priceData) {
      return NextResponse.json(
        { error: 'Failed to get latest price' },
        { status: 500 }
      );
    }

    const price = priceData.price;
    const amountUsdc = amountKes / price;

    // Generate order_ref
    const orderRef = nanoid(8);

    // Insert order using the Supabase client with service key (bypasses RLS)
    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .insert({
        order_ref: orderRef,
        phone_number: phoneNumber,
        product_type: 'airtime',
        amount_kes: amountKes,
        amount_usdc: amountUsdc,
        status: 'pending',
        wallet_address: walletAddress // Store wallet address
      })
      .select()
      .single();

    if (orderError) {
      console.error('Error inserting order:', orderError);
      return NextResponse.json(
        { error: 'Failed to create order' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      orderRef,
      amountKes,
      amountUsdc,
      price,
      orderId: orderData.id
    });
  } catch (error) {
    console.error('Error creating order:', error);
    return NextResponse.json(
      { error: 'Failed to create order' },
      { status: 500 }
    );
  }
}