import { NextResponse, NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase';

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

    // 2. Query airtime_transactions table
    const { data: transaction, error } = await supabase
      .from('airtime_transactions')
      .select('*, orders(*)')
      .eq('provider_request_id', transactionId)
      .single();

    if (error || !transaction) {
      console.error("Transaction not found:", transactionId, error);
      return NextResponse.json({ status: 'Failed' }, { status: 404 });
    }

    // 3. Verify data
    if (
      phoneNumber !== transaction.phone_number ||
      Number(amount) !== transaction.amount
    ) {
      console.warn("Data mismatch in validation callback");
      return NextResponse.json({ status: 'Failed' }, { status: 400 });
    }

    // If all checks pass, respond with 'Validated'
    return NextResponse.json({ status: 'Validated' });

  } catch (error) {
    console.error("Error in Airtime Validation Callback:", error);
    return NextResponse.json({ status: 'Failed' }, { status: 500 });
  }
}