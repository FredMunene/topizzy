import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SERVICE_FEE = parseFloat(process.env.SERVICE_FEE || '0.05'); // Default 0.05 USDC

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

    // Determine country code from phone number (remove + prefix)
    const phoneWithoutPlus = phoneNumber.startsWith('+') ? phoneNumber.substring(1) : phoneNumber;
    const countryCode = phoneWithoutPlus.substring(0, 3); // e.g., "254" for Kenya

    // Currency mapping
    const currencyMap: { [key: string]: string } = {
      "254": "KES",
      "255": "TZS",
      "256": "UGX",
      "250": "RWF",
    };

    const currency = currencyMap[countryCode] || "KES"; // Default to KES if not found

    // Amount restrictions mapping
    const amountRestrictions: { [key: string]: { lower: number; upper: number } } = {
      "254": { lower: 5, upper: 5000 }, // Kenya
      "256": { lower: 50, upper: 200000 }, // Uganda
      "255": { lower: 500, upper: 200000 }, // Tanzania
      "250": { lower: 100, upper: 40000 }, // Rwanda
    };

    const restrictions = amountRestrictions[countryCode] || amountRestrictions["254"]; // Default to Kenya if not found

    if (amountKes < restrictions.lower || amountKes > restrictions.upper) {
      return NextResponse.json(
        { error: `Amount must be between ${restrictions.lower} and ${restrictions.upper} ${currency}` },
        { status: 400 }
      );
    }

    // Get latest price
    const { data: priceData, error: priceError } = await supabase
      .from('prices')
      .select('price')
      .eq('token', 'USDC')
      .eq('currency', currency)
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
    const airtimeUsdc = amountKes / price;
    const serviceFeeUsdc = SERVICE_FEE;
    const totalUsdc = airtimeUsdc + serviceFeeUsdc;

    // Generate order_ref
    const orderRef = nanoid(8);

    // Insert order using the Supabase client with service key (bypasses RLS)
    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .insert({
        order_ref: orderRef,
        phone_number: phoneNumber,
        product_type: 'airtime',
        amount: amountKes,
        amount_usdc: totalUsdc,
        service_fee_usdc: serviceFeeUsdc,
        status: 'pending',
        wallet_address: walletAddress,
        currency: currency
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
      amountUsdc: totalUsdc,
      airtimeUsdc,
      serviceFeeUsdc,
      price,
      orderId: orderData.id,
      currency
    });
  } catch (error) {
    console.error('Error creating order:', error);
    return NextResponse.json(
      { error: 'Failed to create order' },
      { status: 500 }
    );
  }
}