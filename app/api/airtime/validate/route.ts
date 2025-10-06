import { NextResponse } from 'next/server'

export async function POST() {
  // Africa's Talking validation callback
  // Always validate for now
  return NextResponse.json({ status: 'Validated' })
}