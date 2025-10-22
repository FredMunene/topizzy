import { NextResponse, NextRequest } from 'next/server'
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

const TRUSTED_IP_ADDRESSES = ["196.250.215.198"]; 
                    
export async function POST(request: NextRequest) {
  try {
    const data = await request.json()

    const { transactionId, phoneNumber, sourceIpAddress, currencyCode, amount } = data

    console.log("Airtime Validation Callback Data:", data);
    console.log("Received IP Address:", sourceIpAddress);

    if (!transactionId || !phoneNumber || !sourceIpAddress || !currencyCode || !amount) {
      console.warn("Missing parameters in Airtime Validation Callback");
      return NextResponse.json({ status: 'Failed' }, { status: 400 });
    }

    // 1. Validate IP Address - COMMENTED OUT FOR TESTING
    if (!TRUSTED_IP_ADDRESSES.includes(sourceIpAddress)) {
      console.warn("Untrusted IP Address:", sourceIpAddress);
      return NextResponse.json({ status: 'Failed' }, { status: 403 });
    }

    // 2. Query orders table for pending order
    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('phone_number', phoneNumber)
      .eq('amount', Number(amount))
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !order) {
      console.error("Pending order not found for validation:", { phoneNumber, amount, error });
      return NextResponse.json({ status: 'Failed' }, { status: 404 });
    }

    console.log("Order found for validation:", order);

    // 3. Verify currency matches
    if (order.currency !== currencyCode) {
      console.warn("Currency mismatch in validation callback:", { expected: order.currency, received: currencyCode });
      return NextResponse.json({ status: 'Failed' }, { status: 400 });
    }

    // If all checks pass, respond with 'Validated'
    return NextResponse.json({ status: 'Validated' });

  } catch (error) {
    console.error("Error in Airtime Validation Callback:", error);
    return NextResponse.json({ status: 'Failed' }, { status: 500 });
  }
}